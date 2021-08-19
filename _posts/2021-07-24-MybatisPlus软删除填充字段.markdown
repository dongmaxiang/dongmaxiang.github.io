---
layout: post
title: MybatisPlus批量软删除填充字段
permalink: /MybatisPlus软删除填充字段
date: 2021-07-24 22:40:00 +08:00
categories: [java,mybatis]
tags: [效率,mybatis]
---

## 背景
mybatisPlus 使用`@TableLogic`注解表示当前表没有物理删除，只能根据当前注解的字段进行软删除  
软删除时像正常调用删除的API即可。但是软删除并不会使字段填充器生效  
[字段填充器]({{ "/MybatisPlus增删改时自动填充时间创建人等信息" | relative_url }})  
本文的目的就是批量软删除时可以使字段填充器生效，目前我用的3.3.2有单个的软删除使字段填充器生效，但是批量的没有

## 单个软删除的mybatisPlus源码

* 单个软删除的AbstractMethod源码  
    ```java
    
    /**
     * 根据 id 逻辑删除数据,并带字段填充功能
     * <p>注意入参是 entity !!! ,如果字段没有自动填充,就只是单纯的逻辑删除</p>
     * <p>
     * 自己的通用 mapper 如下使用:
     * <pre>
     * int deleteByIdWithFill(T entity);
     * </pre>
     * </p>
     *
     * @author miemie
     * @since 2018-11-09
     */
    public class LogicDeleteByIdWithFill extends AbstractMethod {
    
        @Override
        public MappedStatement injectMappedStatement(Class<?> mapperClass, Class<?> modelClass, TableInfo tableInfo) {
            String sql;
            SqlMethod sqlMethod = SqlMethod.LOGIC_DELETE_BY_ID;
            if (tableInfo.isLogicDelete()) {
                List<TableFieldInfo> fieldInfos = tableInfo.getFieldList().stream()
                    .filter(TableFieldInfo::isWithUpdateFill)
                    .collect(toList());
                if (CollectionUtils.isNotEmpty(fieldInfos)) {
                    String sqlSet = "SET " + fieldInfos.stream().map(i -> i.getSqlSet(EMPTY)).collect(joining(EMPTY))
                        + tableInfo.getLogicDeleteSql(false, false);
                    sql = String.format(sqlMethod.getSql(), tableInfo.getTableName(), sqlSet, tableInfo.getKeyColumn(),
                        tableInfo.getKeyProperty(), tableInfo.getLogicDeleteSql(true, true));
                } else {
                    sql = String.format(sqlMethod.getSql(), tableInfo.getTableName(), sqlLogicSet(tableInfo),
                        tableInfo.getKeyColumn(), tableInfo.getKeyProperty(),
                        tableInfo.getLogicDeleteSql(true, true));
                }
            } else {
                sqlMethod = SqlMethod.DELETE_BY_ID;
                sql = String.format(sqlMethod.getSql(), tableInfo.getTableName(), tableInfo.getKeyColumn(),
                    tableInfo.getKeyProperty());
            }
            SqlSource sqlSource = languageDriver.createSqlSource(configuration, sql, modelClass);
            return addUpdateMappedStatement(mapperClass, modelClass, getMethod(sqlMethod), sqlSource);
        }
    
        @Override
        public String getMethod(SqlMethod sqlMethod) {
            // 自定义 mapper 方法名
            return "deleteByIdWithFill";
        }
    }
    ```

## 批量删除的mybatisPlus源码
没有使字段填充器生效哦
```java
/**
 * 根据 ID 集合删除
 *
 * @author hubin
 * @since 2018-04-06
 */
public class DeleteBatchByIds extends AbstractMethod {

    @Override
    public MappedStatement injectMappedStatement(Class<?> mapperClass, Class<?> modelClass, TableInfo tableInfo) {
        String sql;
        SqlMethod sqlMethod = SqlMethod.LOGIC_DELETE_BATCH_BY_IDS;
        if (tableInfo.isLogicDelete()) {
            sql = String.format(sqlMethod.getSql(), tableInfo.getTableName(), sqlLogicSet(tableInfo),
                tableInfo.getKeyColumn(),
                SqlScriptUtils.convertForeach("#{item}", Constants.COLLECTION, null, "item", COMMA),
                tableInfo.getLogicDeleteSql(true, true));
            SqlSource sqlSource = languageDriver.createSqlSource(configuration, sql, Object.class);
            return addUpdateMappedStatement(mapperClass, modelClass, getMethod(sqlMethod), sqlSource);
        } else {
            sqlMethod = SqlMethod.DELETE_BATCH_BY_IDS;
            sql = String.format(sqlMethod.getSql(), tableInfo.getTableName(), tableInfo.getKeyColumn(),
                SqlScriptUtils.convertForeach("#{item}", Constants.COLLECTION, null, "item", COMMA));
            SqlSource sqlSource = languageDriver.createSqlSource(configuration, sql, Object.class);
            return this.addDeleteMappedStatement(mapperClass, getMethod(sqlMethod), sqlSource);
        }
    }
}
```

## 分析
* mybatisPlus在初始化的时候会给每个表添加通用的Statement映射
* 批量删除需要接受两个参数，一个是实体(不然字段填充器往哪里填？)，一个是idList集合，所以需要从新定义一个方法

## 自定义批量软删除的代码
```java
/**
 * <p>
 * 自己的通用 mapper 如下使用:
 * <pre>
 * int deleteBatchIdsWithFill(@Param(Constants.ENTITY) T t, @Param(Constants.COLLECTION) Collection<? extends Serializable> idList);
 * </pre>
 * </p>
 * 
 */
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

> 最后需要把sql映射的工具类添加到Spring容器中哦
```java
 @Bean
public AbstractSqlInjector customSqlMethod() {
    List<AbstractMethod> allMethodList = new ArrayList<>();
    //单个删除withFillApi
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