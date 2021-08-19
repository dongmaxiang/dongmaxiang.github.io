---
layout: post
title: java动态代理
date: 2021-07-1 18:58:55.000000000 +08:00
categories: [java,动态代理]
tags: [java,开发工具类]
permalink: /java动态代理
---
动态代理有很多使用的场景，比如  
* springAOP切入
* spring事务、缓存
* 自定义业务场景等

[本文的使用场景（点我）](#本文的使用场景)

# 代码  
```java
import org.springframework.beans.BeanUtils;
import org.springframework.cglib.proxy.Enhancer;
import org.springframework.cglib.proxy.MethodInterceptor;
import org.springframework.cglib.proxy.MethodProxy;
import org.springframework.util.ClassUtils;
import org.springframework.util.ReflectionUtils;

import java.beans.PropertyDescriptor;
import java.lang.reflect.Method;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * 动态代理
 *
 * @author anyOne
 * @since 2021/4/30 12:19 PM
 */
public class DynamicProxy<T> implements MethodInterceptor {

    private final T target;
    private final Class<?> targetClass;
    private final boolean ignoreObjectMethod;
    private final Object[] arguments;
    private CallBack<T> callBack;

    public DynamicProxy(T proxyTarget, Object... arguments) {
        this(proxyTarget, true, arguments);
    }

    public DynamicProxy(T proxyTarget, boolean ignoreObjectMethod, Object... arguments) {
        this.target = proxyTarget;
        this.ignoreObjectMethod = ignoreObjectMethod;
        this.targetClass = proxyTarget.getClass();
        this.arguments = arguments;
    }


    /**
     * 忽略所有的set方法
     */
    public T getProxyWithWriteMethod(CallBack<T> callBack) {
        Set<Method> ignoreMethodNames = Stream.of(BeanUtils.getPropertyDescriptors(targetClass))
                .map(PropertyDescriptor::getWriteMethod)
                .collect(Collectors.toSet());

        this.callBack = (obj, proxyMethod, args, originMethod) -> {
            if (ignoreMethodNames.contains(originMethod)) {
                return callBack.call(target, proxyMethod, args, originMethod);
            }
            return proxyMethod.invoke(target, args);
        };
        return getT();

    }

    public T getProxy(CallBack<T> callBack) {
        this.callBack = callBack;
        return getT();
    }

    private T getT() {
        // 创建代理对象
        Enhancer enhancer = new Enhancer();
        enhancer.setSuperclass(targetClass);
        enhancer.setCallback(this);

        try {
            return create(enhancer);
        } catch (Exception e) {
            // 如果针对class创建失败，则只针对接口创建代理
            enhancer = new Enhancer();
            Class<?>[] allInterfacesForClass = ClassUtils.getAllInterfacesForClass(targetClass);
            enhancer.setInterfaces(allInterfacesForClass);
            enhancer.setCallback(this);
            return create(enhancer);
        }
    }

    private T create(Enhancer enhancer) {
        if (arguments == null || arguments.length == 0) {
            //noinspection unchecked
            return (T) enhancer.create();
        } else {
            Class<?>[] classes = Stream.of(arguments)
                    .map(Object::getClass)
                    .toArray(Class[]::new);
            //noinspection unchecked
            return (T) enhancer.create(classes, arguments);
        }
    }


    @Override
    public Object intercept(Object obj, Method originMethod, Object[] args, MethodProxy proxyMethod) throws Throwable {
        if (ignoreObjectMethod && ReflectionUtils.isObjectMethod(originMethod)) {
            return proxyMethod.invoke(target, args);
        }
        return callBack.call(target, proxyMethod, args, originMethod);
    }


    public interface CallBack<T> {
        /**
         * 代理拦截的方法，需要用户自己实现
         */
        Object call(T target, MethodProxy proxyMethod, Object[] args, Method originMethod) throws Throwable;
    }
}
```

## <span id='本文的使用场景'>使用方式之一</span>
分页查询只想查询一个，但是每次new对象在去赋值，非常浪费时间。并且还会出遗漏的问题    
所以建一个全局的对象，但是这个全局的对象，他又是多线程共享，不能保证他的安全，比如我只想保证他的变量page=1,别的线程set就会影响其他线程。  
所以如果我建立一个全局的变量，大家共享，也不怕被set而影响其他的线程，那么可以用到此动态代理

```java
public class Pageable {
    private static final int DEFAULT_SIZE = 10;
    private static final int MAX_SIZE = 1000;

    public static final Pageable ONLY_ONE = new DynamicProxy<>(newOnlyOne(), true)
            .getProxyWithWriteMethod((target, proxyMethod, args, originMethod) -> {
                // 此处抛出异常，也可以return null，但我建议还是把问题暴露出去，避免留坑
                throw new Throwable("禁止修改全局的类");
            });

    public static Pageable newOnlyOne() {
        Pageable onlyOne = new Pageable();
        onlyOne.setSearchCount(false);
        onlyOne.setPage(1);
        onlyOne.setPageSize(1);
        return onlyOne;
    }

    private long page = 1;

    private long pageSize = DEFAULT_SIZE;

    private boolean isSearchCount = true;
}
```