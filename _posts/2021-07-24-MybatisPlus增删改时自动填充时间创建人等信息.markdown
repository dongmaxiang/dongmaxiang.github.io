---
layout: post
title: MybatisPlus增删改时自动填充时间创建人等信息
permalink: /MybatisPlus增删改时自动填充时间创建人等信息
date: 2021-07-24 21:38:00 +08:00
categories: [java,mybatis]
tags: [效率,mybatis]
---

# 背景
自动填充是个好东西，可以帮助我们省去一些开发时间，只专注于业务的本身。  
mybatisPlus使用自动填充更简单只需要注解  
`@TableField(fill = FieldFill.INSERT)`或者`@TableField(fill = FieldFill.UPDATE)`  
FieldFill.INSERT对应insertFill填充逻辑  
FieldFill.UPDATE对应updateFill填充逻辑

# 代码

注意重写了`strictFill`方法  
填充的值和类型基本都一样。所以第三个参数为null，不作类型判断，如果类型不匹配set会直接报错。  
项目嘛，就应该有统一的规范，按照规范来，不按照规范就直接报错，省去了代码review的时间
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

# 原理

## MybatisPlus的参数处理程序
* 最终调用了`process`方法，间接调用了`insertFill`或者`updateFill`
* 看得出来局限了吗？只能针对实体进行填充  
[软删除填充字段]({{ "/MybatisPlus批量软删除填充字段" | relative_url }})
```java
public class MybatisDefaultParameterHandler extends DefaultParameterHandler {

    private final TypeHandlerRegistry typeHandlerRegistry;
    private final MappedStatement mappedStatement;
    private final Object parameterObject;
    private final BoundSql boundSql;
    private final Configuration configuration;

    public MybatisDefaultParameterHandler(MappedStatement mappedStatement, Object parameterObject, BoundSql boundSql) {
        // processParameter 处理参数
        super(mappedStatement, processParameter(mappedStatement, parameterObject), boundSql);
        this.mappedStatement = mappedStatement;
        this.configuration = mappedStatement.getConfiguration();
        this.typeHandlerRegistry = mappedStatement.getConfiguration().getTypeHandlerRegistry();
        this.parameterObject = parameterObject;
        this.boundSql = boundSql;
    }

    protected static Object processParameter(MappedStatement ms, Object parameterObject) {
        /* 只处理插入或更新操作 */
        if (parameterObject != null
                && (SqlCommandType.INSERT == ms.getSqlCommandType() || SqlCommandType.UPDATE == ms.getSqlCommandType())) {
            //检查 parameterObject
            if (ReflectionKit.isPrimitiveOrWrapper(parameterObject.getClass())
                    || parameterObject.getClass() == String.class) {
                return parameterObject;
            }
            Collection<Object> parameters = getParameters(parameterObject);
            if (null != parameters) {
                // 感觉这里可以稍微优化一下，理论上都是同一个.
                parameters.forEach(obj -> process(ms, obj));
            } else {
                process(ms, parameterObject);
            }
        }
        return parameterObject;
    }
    
    private static void process(MappedStatement ms, Object parameterObject) {
        if (parameterObject != null) {
            TableInfo tableInfo = null;
            Object entity = parameterObject;
            if (parameterObject instanceof Map) {
                Map<?, ?> map = (Map<?, ?>) parameterObject;
                if (map.containsKey(Constants.ENTITY)) {
                    Object et = map.get(Constants.ENTITY);
                    if (et != null) {
                        entity = et;
                        tableInfo = TableInfoHelper.getTableInfo(entity.getClass());
                    }
                }
            } else {
                tableInfo = TableInfoHelper.getTableInfo(parameterObject.getClass());
            }
            if (tableInfo != null) {
                //到这里就应该转换到实体参数对象了,因为填充和ID处理都是争对实体对象处理的,不用传递原参数对象下去.
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
}
```

## 调用MybatisPlus的ibatis代码

```java
public abstract class BaseStatementHandler implements StatementHandler {

    protected final Configuration configuration;
    protected final ObjectFactory objectFactory;
    protected final TypeHandlerRegistry typeHandlerRegistry;
    protected final ResultSetHandler resultSetHandler;
    protected final ParameterHandler parameterHandler;

    protected final Executor executor;
    protected final MappedStatement mappedStatement;
    protected final RowBounds rowBounds;

    protected BoundSql boundSql;

    protected BaseStatementHandler(Executor executor, MappedStatement mappedStatement, Object parameterObject, RowBounds rowBounds, ResultHandler resultHandler, BoundSql boundSql) {
        this.configuration = mappedStatement.getConfiguration();
        this.executor = executor;
        this.mappedStatement = mappedStatement;
        this.rowBounds = rowBounds;

        this.typeHandlerRegistry = configuration.getTypeHandlerRegistry();
        this.objectFactory = configuration.getObjectFactory();

        if (boundSql == null) { // issue #435, get the key before calculating the statement
            generateKeys(parameterObject);
            boundSql = mappedStatement.getBoundSql(parameterObject);
        }

        this.boundSql = boundSql;

        // 就是在这里调用了MybatisPlus的填充逻辑
        this.parameterHandler = configuration.newParameterHandler(mappedStatement, parameterObject, boundSql);
        this.resultSetHandler = configuration.newResultSetHandler(executor, mappedStatement, rowBounds, parameterHandler, resultHandler, boundSql);
    }
}
```
