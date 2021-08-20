---
layout: post
title: mybatisPlus分析Lambda语法原理
permalink: /mybatisPlus分析Lambda语法原理
date: 2021-07-25 15:17:00.000000000 +08:00
categories: [java,mybatis]
tags: [mybatis,序列化,反序列化,lambda]
---

用lambda就不用写字符串了，这个对于开发业务来说，能减少很多的错误发生。尤其是字段写错了，数据库变更字段名了，等。  
用法如下
```java
eq(FissionCoupon::getMid, mid)
```
他会自动转换为mid，那他的原理是什么呢？  
原来他接受的是一个可序列化的Function对象
```java
@FunctionalInterface
public interface SFunction<T, R> extends Function<T, R>, Serializable {
}
```

其实用到了jdk自带的序列化。因为lambda是个特殊的实例，也是个特殊的class。  
在序列化的时候lambda实例中有一个writeReplace方法。  
* 可参考jdk的序列化 [Serializable原理]({{ "/java的序列化和反序列化Serializable原理.html" | relative_url }})  
该方法的返回值是一个lambda描述对象，```java.lang.invoke.SerializedLambda```  
```java
public final class SerializedLambda implements Serializable {
    private static final long serialVersionUID = 8025925345765570181L;
    private final Class<?> capturingClass;
    private final String functionalInterfaceClass;
    private final String functionalInterfaceMethodName;
    private final String functionalInterfaceMethodSignature;
    private final String implClass;
    private final String implMethodName;
    private final String implMethodSignature;
    private final int implMethodKind;
    private final String instantiatedMethodType;
    private final Object[] capturedArgs;
    。。。。
}
```
通过此对象就能获取到对应的方法名，等信息了。通过方法名去掉get|set|is方法之后就得到字段名称了

# 总结
通过调用可序列化的lambda实例中的writeReplace方法，获取到lambda对象及可获取到里面的各种信息