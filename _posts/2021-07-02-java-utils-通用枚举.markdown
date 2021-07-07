---
layout: post
title: 通用枚举
date: 2021-07-02 15:15:00.000000000 +08:00
categories: [java,工具类]
tags: [java,开发工具类,枚举]
---

# 使用场景
我们一般用枚举来代表数字或者字符串，避免魔法值的产生，有时需要根据数字或字符串获取到对应的枚举。避免**冗余代码**，所以用到此工具类

## 代码  

### <span id='一个枚举对应多个标识'>一个枚举可以有多个标识</span>  
```java
import java.io.Serializable;
import java.util.Objects;
import java.util.Optional;

/**
 * IdentityIEnums
 * 可以有多个标识的枚举
 *
 * @author anyOne
 * @since 2021/5/12 2:32 PM
 */
public interface IEnums<T extends Serializable> {

    /**
     * 获取枚举的标识
     */
    T[] getIdentities();

    /**
     * 传入指定的枚举class，和指定的identity(变量标识)
     * 如果枚举的identity和传入的相等则返回对应的枚举
     */
    static <T extends Serializable, E extends IEnums<T>> E mustGetEnum(Class<E> enumClass, T identity) {
        return getEnum(enumClass, identity)
                .orElseThrow(NullPointerException::new);
    }

    static <T extends Serializable, E extends IEnums<T>> Optional<E> getEnum(Class<E> enumClass, T identity) {
        E e = getEnum(enumClass, identity, null);
        return Optional.ofNullable(e);
    }

    static <T extends Serializable, E extends IEnums<T>> E getEnum(Class<E> enumClass, T identity, E defaultValue) {
        for (E enumConstant : enumClass.getEnumConstants()) {
            for (T t : enumConstant.getIdentities()) {
                if (Objects.equals(t, identity)) {
                    return enumConstant;
                }
            }
        }
        return defaultValue;
    }

}
```

### 一个枚举对应一个标识  

* util  
```java
import java.io.Serializable;
// 单个变成数组util
public class ObjectUtils extends org.apache.commons.lang3.ObjectUtils {
    @SafeVarargs
    public static <T extends Serializable> T[] array(T... t) {
        return t;
    }
}
```  

* 代码复用、最终还是调用[一个枚举对应多个标识](#一个枚举对应多个标识)那个工具类  
    ```java
    import ObjectUtils;
    import java.io.Serializable;
    import java.util.Optional;
    
    /**
     * IdentityIEnum
     * 只能有一个标识的枚举
     *
     * @author anyOne
     * @since 2021/5/12 2:32 PM
     */
    public interface IEnum<T extends Serializable> extends IEnums<T> {
    
        /**
         * 获取枚举的标识
         */
        T getIdentity();
  
        // 默认实现获取多个标识 
        default T[] getIdentities() {
            // @see getIdentity 调用获取单个标识，然后通过util变成一个数组。
            return ObjectUtils.array(getIdentity());
        }
    
        static <T extends Serializable, E extends IEnum<T>> E mustGetEnum(Class<E> enumClass, T identity) {
            return IEnums.mustGetEnum(enumClass, identity);
        }
    
        static <T extends Serializable, E extends IEnum<T>> Optional<E> getEnum(Class<E> enumClass, T identity) {
            return IEnums.getEnum(enumClass, identity);
        }
    
        static <T extends Serializable, E extends IEnum<T>> E getEnum(Class<E> enumClass, T identity, E defaultValue) {
            return IEnums.getEnum(enumClass, identity, defaultValue);
        }
    
    }
    ```  

## 使用方式之一

* 工具类  
```java
@Slf4j
public enum ENV implements IEnums<String> {
    RELEASE("release", "prod"),
    PRE("pre"),
    TEST("test", "test1", "test2", "test3"),
    DEV("dev"),
    LOCAL("local"),
    ;

    private final String[] envs;

    ENV(String... envs) {
        this.envs = envs;
    }

    // 只要实现此方法即可
    @Override
    public String[] getIdentities() {
        return envs;
    }
}
```

* 使用详情  
```java
ENV env = IEnums.getEnum(ENV.class, "dev", RELEASE);
```