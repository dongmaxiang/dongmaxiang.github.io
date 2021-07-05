---
layout: post
title: 通用枚举
date: 2021-07-02 15:15:00.000000000 +08:00
categories: [java,utils]
tags: [java,工具类,枚举]
---
# 使用场景
我们一般用枚举来代表数字或者字符串，避免魔法值的产生，有时需要根据数字或字符串获取到对应的枚举。避免**冗余代码**，所以用到此工具类

## 代码  

### 一个枚举对应一个个标识
### 一个枚举可以有做个标识
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
## 使用方式之一
