---
layout: post
title: 动态代理
date: 2021-07-1 18:58:55.000000000 +08:00
categories: [java,utils]
tags: [java,工具类,动态代理]
---
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

## 使用方式之一
```java
public class Pageable {
    private static final int DEFAULT_SIZE = 10;
    private static final int MAX_SIZE = 1000;

    public static final Pageable ONLY_ONE = new DynamicProxy<>(newOnlyOne(), true)
            .getProxyWithWriteMethod((target, proxyMethod, args, originMethod) -> {
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