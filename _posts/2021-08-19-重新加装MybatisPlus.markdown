---
layout: post
title: 重新加装MybatisPlus
permalink: /重新加装MybatisPlus
date: 2021-08-19 21:20:21.000000000 +08:00
categories: [java,mybatis]
tags: [mybatis,mybatisPlus]
---

# 1.字段填充器

注意重写了`strictFill`方法  
统一规范，字段填充的值和类型所有的表都一样。所以不作类型判断。
```java
@Component
public class FieldAutoFillHandler implements MetaObjectHandler {

    @Override
    public void insertFill(MetaObject metaObject) {
        User user = CurrentUser.getCurrentUser();

        this.strictInsertFill(metaObject, "deleteFlag", null, DeleteFlag.N);
        this.strictInsertFill(metaObject, "isDelete", null, DeleteFlag.N);

        this.strictInsertFill(metaObject, "createUserId", null, user.getUserId());
        this.strictInsertFill(metaObject, "creatorUserId", null, user.getUserId());

        this.strictInsertFill(metaObject, "createUserName", null, user.getUserName());
        this.strictInsertFill(metaObject, "creatorUserName", null, user.getUserName());

        this.strictInsertFill(metaObject, "createTime", null, LocalDateTime.now());
    }

    @Override
    public void updateFill(MetaObject metaObject) {
        User user = CurrentUser.getCurrentUser();

        this.strictUpdateFill(metaObject, "updateTime", null, LocalDateTime.now());
        this.strictUpdateFill(metaObject, "updateUserId", null, user.getUserId());
        this.strictUpdateFill(metaObject, "updateUserName", null, user.getUserName());
    }

    /**
     * 重写自动填充的逻辑
     * 只要有该字段、且字段为空、则填充
     */
    @Override
    public MetaObjectHandler strictFill(boolean insertFill, TableInfo tableInfo, MetaObject metaObject, List<StrictFill> strictFills) {

        strictFills.forEach(i -> {
            final String fieldName = i.getFieldName();
            if (!metaObject.hasSetter(fieldName)) {
                return;
            }
            if (metaObject.getValue(fieldName) != null) {
                return;
            }
            Object value = i.getFieldVal().get();
            if (value == null) {
                return;
            }
            metaObject.setValue(fieldName, value);
        });
        return this;
    }

}
```

## 原理

* 最终调用了`insertFill`或者`updateFill`  
```java
// 调用MybatisPlus 的 ibatis代码
public abstract class BaseStatementHandler implements StatementHandler {
    protected BaseStatementHandler(Executor executor, MappedStatement mappedStatement, Object parameterObject, RowBounds rowBounds, ResultHandler resultHandler, BoundSql boundSql) {
        。。。
        // 就是在这里调用了MybatisPlus的填充逻辑
        this.parameterHandler = configuration.newParameterHandler(mappedStatement, parameterObject, boundSql);
        。。。
    }
}

// MybatisPlus的参数处理程序
public class MybatisDefaultParameterHandler extends DefaultParameterHandler {

    private final TypeHandlerRegistry typeHandlerRegistry;
    private final MappedStatement mappedStatement;
    private final Object parameterObject;
    private final BoundSql boundSql;
    private final Configuration configuration;

    public MybatisDefaultParameterHandler(MappedStatement mappedStatement, Object parameterObject, BoundSql boundSql) {
        // processParameter 处理参数
        super(mappedStatement, processParameter(mappedStatement, parameterObject), boundSql);
        。。。
    }

    protected static Object processParameter(MappedStatement ms, Object parameterObject) {
        if (parameterObject != null &&
            (SqlCommandType.INSERT == ms.getSqlCommandType() || SqlCommandType.UPDATE == ms.getSqlCommandType())
        ) {
            。。。
            Collection<Object> parameters = getParameters(parameterObject);
            if (null != parameters) {
                parameters.forEach(obj -> process(ms, obj));
            } else {
                process(ms, parameterObject);
            }
        }
        return parameterObject;
    }

    private static void process(MappedStatement ms, Object parameterObject) {
        TableInfo tableInfo;
        ...
        if (tableInfo != null) {
            MetaObject metaObject = ms.getConfiguration().newMetaObject(entity);
            if (SqlCommandType.INSERT == ms.getSqlCommandType()) {
                populateKeys(tableInfo, metaObject, entity);
                // 最终填充
                insertFill(metaObject, tableInfo);
            } else {
                // 最终填充
                updateFill(metaObject, tableInfo);
            }
        }
    }
}
```

# 2.[批量|单个]软删除使自动填充器生效（默认不生效）
mybatisPlus 使用`@TableLogic`注解在字段上，表示当前表软删除，当前字段为软删除字段    
正常调用删除的API即可软删除。但是缺点是：并不会使字段填充器生效  
目前我用的3.3.2有单个的软删除使字段填充器生效，但是批量的没有  
批量软删除参考批量删除的方法  

* mybatisPlus在初始化的时候会给每个表添加通用的Statement映射
* 批量软删除需要再加一个参数，总共两个参数，一个是实体(不然字段填充器往哪里填？)，一个是删除的idList集合，所以需要从新定义一个方法

## 自定义批量软删除的代码
```java
// mapper新增一个方法
int deleteBatchIdsWithFill(@Param(Constants.ENTITY) T t, @Param(Constants.COLLECTION) Collection<? extends Serializable> idList);

// 具体statement实现
public class LogicBatchDeleteWithFill extends AbstractMethod {

    // mapper的方法名
    private static final String MAPPER_METHOD = "deleteBatchIdsWithFill";

    @Override
    public MappedStatement injectMappedStatement(Class<?> mapperClass, Class<?> modelClass, TableInfo tableInfo) {
        // 如果表不是逻辑删除，则复用SqlMethod.DELETE_BATCH_BY_IDS
        if (!tableInfo.isLogicDelete()) {
            String sql = String.format(SqlMethod.DELETE_BATCH_BY_IDS.getSql()
                    , tableInfo.getTableName()
                    , tableInfo.getKeyColumn()
                    , SqlScriptUtils.convertForeach("#{item}", Constants.COLLECTION, null, "item", COMMA)
            );
            SqlSource sqlSource = languageDriver.createSqlSource(configuration, sql, Object.class);
            return this.addDeleteMappedStatement(mapperClass, MAPPER_METHOD, sqlSource);
        }

        // 引用批量删除的sql
        SqlMethod sqlMethod = SqlMethod.LOGIC_DELETE_BATCH_BY_IDS;

        // 找出是需要记录更新的字段
        List<TableFieldInfo> fieldInfos = tableInfo.getFieldList().stream()
                .filter(TableFieldInfo::isWithUpdateFill)
                .collect(toList());
        String sql;
        if (CollectionUtils.isNotEmpty(fieldInfos)) {
            // 这里是重点，把mapper新定义的方法第一个参数作为前缀，把需要更新的字段拼到sql中
            String sqlSet = "SET " + fieldInfos.stream().map(i -> i.getSqlSet(Constants.ENTITY_DOT)).collect(joining(EMPTY))
                    + tableInfo.getLogicDeleteSql(false, false);
            sql = String.format(sqlMethod.getSql()
                    , tableInfo.getTableName()
                    , sqlSet, tableInfo.getKeyColumn()
                    , SqlScriptUtils.convertForeach("#{item}", Constants.COLLECTION, null, "item", COMMA)
                    , tableInfo.getLogicDeleteSql(true, true)
            );
        } else {
            sql = String.format(sqlMethod.getSql()
                    , tableInfo.getTableName()
                    , sqlLogicSet(tableInfo)
                    , tableInfo.getKeyColumn()
                    , SqlScriptUtils.convertForeach("#{item}", Constants.COLLECTION, null, "item", COMMA)
                    , tableInfo.getLogicDeleteSql(true, true)
            );
        }
        SqlSource sqlSource = languageDriver.createSqlSource(configuration, sql, modelClass);
        return this.addUpdateMappedStatement(mapperClass, modelClass, MAPPER_METHOD, sqlSource);
    }
}
```

## 最后需要把sql映射的工具类添加到Spring容器中哦
```java
 @Bean
public AbstractSqlInjector customSqlMethod() {
    List<AbstractMethod> allMethodList = new ArrayList<>();
    //单个删除withFillApi（3.3.2自带）
    allMethodList.add(new LogicDeleteByIdWithFill());
    //批量删除withFillApi
    allMethodList.add(new LogicBatchDeleteWithFill());
    // 默认的api
    allMethodList.addAll(new DefaultSqlInjector().getMethodList(null));
    return new AbstractSqlInjector() {
        @Override
        public List<AbstractMethod> getMethodList(Class<?> mapperClass) {
            return allMethodList;
        }
    };
}
```

> 使用的话一定要使用mapper新定义的方法哦

大功告成

# 3.MybatisPlus查询软删除的数据

## 首先定义方法到mapper里面
```java

// BaseDomain是我们数据库实体的父类
public interface CustomBaseMapper<T extends BaseDomain<? extends Serializable>> extends BaseMapper<T> {

    /**
     * 查询数据忽略已经删除的数据
     * ps: 如果有逻辑删除的话
     */
    List<T> selectListIgnoreDeleted(@Param(Constants.WRAPPER) Wrapper<T> wrapper);

    /**
     * 查询数据忽略已经删除的数据
     * ps: 如果有逻辑删除的话
     */
    T selectOneIgnoreDeleted(@Param(Constants.WRAPPER) Wrapper<T> wrapper);

    /**
     * 根据 ID 查询忽略已经删除的数据
     * ps: 如果有逻辑删除的话
     */
    T selectByIdIgnoreDeleted(Serializable id);

    /**
     * 查询（根据ID 批量查询）忽略已经删除的数据
     * ps: 如果有逻辑删除的话
     */
    List<T> selectBatchIdsIgnoreDeleted(@Param(Constants.COLLECTION) Collection<? extends Serializable> idList);
}
```

## 然后定义这些个方法的实现

**有用动态代理啊[动态代理]({{ "/java动态代理" | relative_url }})**


```java
/**
 * 查询单个时忽略已删除的数据
 * ps:如果有逻辑删除的话
 */
public static class SelectOneIgnoreDeleted extends AbstractMethod {

    private static final String MAPPER_METHOD = "selectOneIgnoreDeleted";

    @Override
    public MappedStatement injectMappedStatement(Class<?> mapperClass, Class<?> modelClass, TableInfo tableInfo) {

        // DynamicProxy为本文的动态代理
        TableInfo ignoreDeleteLogic = new DynamicProxy<>(tableInfo, Object.class)
                .getProxy((target, proxyMethod, args, originMethod) -> {
                    // 忽略逻辑删除
                    if (originMethod.getName().equals("isLogicDelete")) {
                        // 直接返回false
                        return false;
                    }
                    return proxyMethod.invoke(target, args);
                });

        String formatted = String.format(SqlMethod.SELECT_ONE.getSql()
                , sqlFirst()
                , sqlSelectColumns(tableInfo, true)
                , tableInfo.getTableName()
                , sqlWhereEntityWrapper(true, ignoreDeleteLogic)
                , sqlComment()
        );

        SqlSource sqlSource = languageDriver.createSqlSource(configuration, formatted, modelClass);

        return this.addSelectMappedStatementForTable(mapperClass, MAPPER_METHOD, sqlSource, tableInfo);
    }
}

/**
 * 查询单个id时忽略已删除的数据
 * ps:如果有逻辑删除的话
 */
public static class SelectByIdIgnoreDeleted extends AbstractMethod {

    private static final String MAPPER_METHOD = "selectByIdIgnoreDeleted";

    @Override
    public MappedStatement injectMappedStatement(Class<?> mapperClass, Class<?> modelClass, TableInfo tableInfo) {

        String formatted = String.format(SqlMethod.SELECT_BY_ID.getSql()
                , sqlSelectColumns(tableInfo, false)
                , tableInfo.getTableName(), tableInfo.getKeyColumn(), tableInfo.getKeyProperty()
                , EMPTY
        );

        SqlSource sqlSource = new RawSqlSource(configuration, formatted, Object.class);
        return this.addSelectMappedStatementForTable(mapperClass, MAPPER_METHOD, sqlSource, tableInfo);
    }
}

/**
 * 查询多个id时忽略已删除的数据
 * ps:如果有逻辑删除的话
 */
public static class SelectBatchByIdsIgnoreDeleted extends AbstractMethod {

    private static final String MAPPER_METHOD = "selectBatchIdsIgnoreDeleted";

    @Override
    public MappedStatement injectMappedStatement(Class<?> mapperClass, Class<?> modelClass, TableInfo tableInfo) {
        String sqlFormatted = String.format(SqlMethod.SELECT_BATCH_BY_IDS.getSql()
                , sqlSelectColumns(tableInfo, false)
                , tableInfo.getTableName()
                , tableInfo.getKeyColumn()
                , SqlScriptUtils.convertForeach("#{item}", COLLECTION, null, "item", COMMA)
                , EMPTY
        );
        SqlSource sqlSource = languageDriver.createSqlSource(configuration, sqlFormatted, Object.class);
        return addSelectMappedStatementForTable(mapperClass, MAPPER_METHOD, sqlSource, tableInfo);
    }
}

/**
 * 查询列表时忽略已删除的数据
 * ps:如果有逻辑删除的话
 */
public static class SelectListIgnoreDeleted extends AbstractMethod {

    private static final String MAPPER_METHOD = "selectListIgnoreDeleted";

    @Override
    public MappedStatement injectMappedStatement(Class<?> mapperClass, Class<?> modelClass, TableInfo tableInfo) {

        // 忽略逻辑删除
        TableInfo ignoreDeleteLogic = new DynamicProxy<>(tableInfo, Object.class)
                .getProxy((target, proxyMethod, args, originMethod) -> {
                    if (originMethod.getName().equals("isLogicDelete")) {
                        // 直接返回false
                        return false;
                    }
                    return proxyMethod.invoke(target, args);
                });

        String sql = String.format(SqlMethod.SELECT_LIST.getSql()
                , sqlFirst()
                , sqlSelectColumns(tableInfo, true)
                , tableInfo.getTableName()
                , sqlWhereEntityWrapper(true, ignoreDeleteLogic)
                , sqlComment()
        );

        SqlSource sqlSource = languageDriver.createSqlSource(configuration, sql, modelClass);
        return this.addSelectMappedStatementForTable(mapperClass, MAPPER_METHOD, sqlSource, tableInfo);
    }
}
```

## 绑定statement
```java

    @Bean
    public AbstractSqlInjector customSqlMethod() {
        List<AbstractMethod> allMethodList = new ArrayList<>();
        // 默认的api
        allMethodList.addAll(new DefaultSqlInjector().getMethodList(null));

        // 新增的api
        List<AbstractMethod> methodList = Stream.of(
                new SelectByIdIgnoreDeleted(),
                new SelectBatchByIdsIgnoreDeleted(),
                new SelectOneIgnoreDeleted(),
                new SelectListIgnoreDeleted()
        ).collect(toList());

        allMethodList.addAll(allMethodList);
        return new AbstractSqlInjector() {
                @Override
                public List<AbstractMethod> getMethodList(Class<?> mapperClass) {
                    return allMethodList;
                }
        };
    }
```

至此完成SQL的statement绑定，然后具体业务继承CustomBaseMapper即可享用啦

# 4.避免字符串编码
lambda语法已经帮我们解决了字符串编码的问题，但是非lambda的api，他的参数只支持接受字符串，那么我们如何避免字符串呢？  
参考[Lambda转字符串]({{ "/mybatisPlus分析Lambda语法原理" | relative_url }})
我们也可以自定义lambda转字符串
```java
/**
 * api获取字段名
 * 避免面向字符串编程
 */
private static <T> String columnToString(SFunction<T, ?> column) {
    // mybatisPlus自带的api
    SerializedLambda resolve = LambdaUtils.resolve(column);
    return org.apache.ibatis.reflection.property.PropertyNamer.methodToProperty(resolve.getImplMethodName());
}
```
这样我们在其他地方也可以用lambda转字段的语法了