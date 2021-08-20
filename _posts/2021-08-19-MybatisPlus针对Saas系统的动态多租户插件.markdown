---
layout: post
title: MybatisPlus针对Saas系统的动态多租户插件
permalink: /MybatisPlus针对Saas系统的动态多租户插件
date: 2021-07-25 22:05:23.000000000 +08:00
categories: [java,mybatis]
tags: [mybatis,多租户]
---
多租户就是用额外的一个字段代表当前表中的数据的归属。在sql curd时根据上下文的用户（租户） 自动拼接此条件  
**动态**就是有些表是公用的，没有多租户的概念。那么操作此表的时候需要排除，亦或者多个字段，每个字段的值都不一样等

# 前期工作
1.首先定义一个多租户字段的枚举，为提取数据库多租户字段的字段做准备  
IEnums参考[通用枚举]({{ "/通用枚举" | relative_url }})
```java
@Getter
public enum TenantField implements IEnums<String> {
    // mid 为我们系统的租户字段
    // CurrentTenant 是业务系统的上下文，比如说当前的登录用户信息，可以自由改造
    MID("商户id", "mid", () -> CurrentTenant.getCurrentTenant().getMid()),
    ;
    private final String[] dbFieldNames;
    private final String doc;
    private final Supplier<Long> getTenantValue;

    TenantField(String doc, String underlineField, Supplier<Long> getTenantValue) {
        this.doc = doc;
        this.getTenantValue = getTenantValue;
        String underlineLower = underlineField.toLowerCase(Locale.ENGLISH);
        String underlineUpper = underlineField.toUpperCase(Locale.ENGLISH);
        String camel = StringUtils.underlineToCamel(underlineField);
        String camelLower = camel.toLowerCase(Locale.ENGLISH);
        String camelUpper = camel.toUpperCase(Locale.ENGLISH);
        // 下划线、驼峰、大写都可以匹配
        this.dbFieldNames = new String[]{underlineLower, underlineUpper, camel, camelLower, camelUpper};
    }

    @Override
    public String[] getIdentities() {
        return dbFieldNames;
    }

    @Override
    public String getDoc() {
        return doc;
    }
}
```
定义好字段，以及获取字段值的方式之后接下来该读取数据库有此字段的表  
为接下来动态拼接sql做准备

# 读取数据库的多租户信息
这个是MYSQL的获取表字段的方式哦，其他类型的数据库请参考其文档
ToString.lazyJson 可参考[优雅打印日志]({{ "/java如何优雅的打印log" | relative_url }})
```java

    @Autowired
    DataSource dataSource;

    /**
     * 表名称和对应的租户对应的字段
     * 忽略大小写的map(mysql不区分大小写)
     */
    private final Map<String, List<String>> tableName$tenantField_map = new CaseInsensitiveKeyMap<>();

    // spring容器给dataSource赋值之后的操作
    @Override
    public void afterPropertiesSet() throws Exception {
        // 所有的多租户字段
        Set<String> tenantColumnNameSet = Arrays.stream(TenantField.values())
                .map(TenantField::getDbFieldNames)
                .flatMap(Arrays::stream)
                .collect(Collectors.toSet());
        log.info("tenant init all supports column names:\n{}", ToString.lazyJson(tenantColumnNameSet));

        try (Connection connection = dataSource.getConnection()) {
            String catalog = connection.getCatalog();
            DatabaseMetaData metaData = connection.getMetaData();
            ResultSet tables = metaData.getTables(catalog, null, null, new String[]{"TABLE"});

            // 循环所有的表
            while (tables.next()) {
                String table_name = tables.getString("TABLE_NAME");
                ResultSet columns = metaData.getColumns(catalog, null, table_name, null);
                // 循环表所有的字段
                while (columns.next()) {
                    String column_name = columns.getString("COLUMN_NAME");
                    // 如果有符合租户字段则Put
                    if (tenantColumnNameSet.contains(column_name)) {
                        tableName$tenantField_map.computeIfAbsent(table_name, k -> Lists.newArrayList())
                                .add(column_name);
                    }
                }
            }
        }
        log.info("tenant init table name and tenant column name :\n{}", ToString.lazyJson(tableName$tenantField_map));
    }

```
提取表对应的租户字段之后就可以做动态注入的操作操作了。  
如果表结构变更，只有重启系统才会生效哦

# 拦截增删改查sql并动态注入条件
```java
@Component
public class CustomTenantSqlParser extends TenantSqlParser {

    // 插入
    @Override
    public void processInsert(net.sf.jsqlparser.statement.insert.Insert insert) {
        ItemsList itemsList = insert.getItemsList();
        if (itemsList == null) {
            return;
        }

        // 判断是否有租户字段并且判断是否为 有效的租户
        List<String> tenantFieldList = ObjectUtils.defaultIfNull(tableName$tenantField_map.get(insert.getTable().getName()), Collections.emptyList());

        // 如果已经显示的有租户字段，则不用处理
        Set<String> existsColumnsSet = insert.getColumns().stream()
                .map(Column::getColumnName)
                .collect(Collectors.toSet());

        tenantFieldList = tenantFieldList.stream()
                .filter(t -> !existsColumnsSet.contains(t))
                .collect(Collectors.toList());

        // 如果当前操作的表没有租户的字段或者非有效租户，直接返回
        if (CollectionUtils.isEmpty(tenantFieldList) || !CurrentTenant.isValidTenant()) {
            return;
        }

        // 添加插入的字段，到最后一列
        List<Column> newColumnList = tenantFieldList.stream()
                .map(Column::new)
                .collect(Collectors.toList());
        insert.getColumns().addAll(newColumnList);


        List<Expression> valueExpressionList = tenantFieldList.stream()
                .map(field -> getTenantValueExpression(IEnums.mustGetEnum(TenantField.class, field)))
                .collect(Collectors.toList());

        // 批量新增
        if (itemsList instanceof MultiExpressionList) {
            ((MultiExpressionList) itemsList).getExprList().forEach(el -> el.getExpressions().addAll(valueExpressionList));
        } else {
            // 单个新增
            ((ExpressionList) insert.getItemsList()).getExpressions().addAll(valueExpressionList);
        }
    }

    // 更新
    @Override
    public void processUpdate(net.sf.jsqlparser.statement.update.Update update) {
        Expression expression = getExpression(update.getTable(), update.getWhere());
        if (expression != null) {
            update.setWhere(expression);
        }
    }

    // 删除
    @Override
    public void processDelete(net.sf.jsqlparser.statement.delete.Delete delete) {
        Expression expression = getExpression(delete.getTable(), delete.getWhere());
        if (expression != null) {
            delete.setWhere(expression);
        }
    }

    private Expression getExpression(Table table, Expression where) {
        List<String> tenantFieldList = tableName$tenantField_map.get(table.getName());
        return builderExpression(where, table, tenantFieldList);
    }

    /**
     * 处理 普通查询
     * @param addColumn   是否添加租户列,insert into select语句中需要
     */
    @Override
    protected void processPlainSelect(PlainSelect plainSelect, boolean addColumn) {
        FromItem fromItem = plainSelect.getFromItem();
        if (fromItem instanceof Table) {
            Table fromTable = (Table) fromItem;
            List<String> tenantFieldList = tableName$tenantField_map.get(fromTable.getName());
            plainSelect.setWhere(builderExpression(plainSelect.getWhere(), fromTable, tenantFieldList));
            if (addColumn) {
                tenantFieldList.forEach(field -> plainSelect.getSelectItems().add(new SelectExpressionItem(new Column(field))));
            }
        } else {
            processFromItem(fromItem);
        }
        List<Join> joins = plainSelect.getJoins();
        if (joins != null && joins.size() > 0) {
            joins.forEach(j -> {
                processJoin(j);
                processFromItem(j.getRightItem());
            });
        }
    }

    // 联表查询
    @Override
    protected void processJoin(Join join) {
        if (join.getRightItem() instanceof Table) {
            Table rightItem = (Table) join.getRightItem();
            List<String> tenantFieldList = tableName$tenantField_map.get(rightItem.getName());
            join.setOnExpression(builderExpression(join.getOnExpression(), rightItem, tenantFieldList));
        }
    }

    // 除新增外最终构造where条件
    private Expression builderExpression(Expression currentExpression, Table table, List<String> tenantFieldList) {
        if (CollectionUtils.isEmpty(tenantFieldList) || !CurrentTenant.isValidTenant()) {
            return currentExpression;
        }

        if (currentExpression instanceof BinaryExpression) {
            BinaryExpression binaryExpression = (BinaryExpression) currentExpression;
            doExpression(binaryExpression.getLeftExpression());
            doExpression(binaryExpression.getRightExpression());
        } else if (currentExpression instanceof InExpression) {
            InExpression inExp = (InExpression) currentExpression;
            ItemsList rightItems = inExp.getRightItemsList();
            if (rightItems instanceof SubSelect) {
                processSelectBody(((SubSelect) rightItems).getSelectBody());
            }
            ItemsList leftItems = inExp.getLeftItemsList();
            if (leftItems instanceof SubSelect) {
                processSelectBody(((SubSelect) leftItems).getSelectBody());
            }
        }

        Expression expression = currentExpression;
        for (String tenantField : tenantFieldList) {
            Expression tenantValueExpression = getTenantValueExpression(IEnums.mustGetEnum(TenantField.class, tenantField));

            Expression appendExpression = this.processTableAlias4CustomizedTenantIdExpression(tenantValueExpression, table, tenantField);
            if (expression instanceof OrExpression) {
                expression = new AndExpression(appendExpression, new Parenthesis(expression));
            } else if (expression != null) {
                expression = new AndExpression(appendExpression, expression);
            } else {
                expression = appendExpression;
            }

        }
        return expression;
    }

    /**
     * 目前: 针对自定义的tenantId的条件表达式[tenant_id in (1,2,3)]，无法处理多租户的字段加上表别名
     * select a.id, b.name
     * from a
     * join b on b.aid = a.id and [b.]tenant_id in (1,2) --别名[b.]无法加上 TODO
     */
    private Expression processTableAlias4CustomizedTenantIdExpression(Expression expression, Table table, String tenantField) {
        if (expression instanceof ValueListExpression) {
            InExpression inExpression = new InExpression();
            inExpression.setLeftExpression(this.getAliasColumn(table, tenantField));
            inExpression.setRightItemsList(((ValueListExpression) expression).getExpressionList());
            return inExpression;
        } else {
            EqualsTo equalsTo = new EqualsTo();
            equalsTo.setLeftExpression(this.getAliasColumn(table, tenantField));
            equalsTo.setRightExpression(expression);
            return equalsTo;
        }
    }

    private Column getAliasColumn(Table table, String tenantField) {
        StringBuilder column = new StringBuilder();
        if (table.getAlias() != null) {
            column.append(table.getAlias().getName()).append(StringPool.DOT);
        }
        column.append(tenantField);
        return new Column(column.toString());
    }

    /**
     * 从当前上下文获取租户的值
     */
    private static Expression getTenantValueExpression(TenantField tenantField) {
        Long tenantId = tenantField.getGetTenantValue().get();
        return new LongValue(tenantId);
    }

}
```
实现增删改方法的拦截之后再把此类注入到spring容器当中即可

# 注入并生效
```java
@Configuration
public class MyBatisPlusConfig {

    @Autowired
    CustomTenantSqlParser customTenantSqlParser;

    /**
     * 分页插件
     * 和
     * sql拦截器
     */
    @Bean
    public PaginationInterceptor paginationInterceptor() {
        PaginationInterceptor paginationInterceptor = new PaginationInterceptor();
        paginationInterceptor.setSqlParserList(Collections.singletonList(customTenantSqlParser));
        return paginationInterceptor;
    }

}
```

至此动态多租户的插件到此结束，实现的效果为所有的sql 会自动拼接对应的条件。但是具体字段名称和字段值的提供都由使用者自定义实现  
这样我们针对saas系统的业务完全可以当做非saas系统来开发，提升开发效率