---
layout: post
title: 通用枚举
date: 2021-07-02 15:15:00.000000000 +08:00
categories: [java,枚举]
tags: [java,开发工具类,枚举]
permalink: /通用枚举
---

# 使用场景
我们一般用枚举来代表数字或者字符串，避免魔法值的产生。
有时需要根据数字或字符串获取到对应的枚举。
虽然可以在枚举里面写静态方法根据int获取对应的枚举也可以做到，但是你需要在一个枚举写一个方法，如果有N多个枚举则会非常的冗余  
类似于这段代码
```java
@Getter
public enum Condition {
  ONCE(0, "满"),
  EACH_TIMES(1, "每满"),
  LADDERED(2, "阶梯满");

  private final int code;
  private final String name;

  Condition(int code, String name) {
    this.code = code;
    this.name = name;
  }

  // 类似于这段代码
  public static Condition getTypeByCode(int code) {
    for (Condition value : Condition.values()) {
      if (value.getCode() == code) {
        return value;
      }
    }
    return null;
  }
}
```
避免**冗余代码**，所以用到此工具类，用法就是所有的枚举需要实现此类即可进行使用

## 代码  

### <span id='一个枚举对应多个标识'>一个枚举可以有多个标识</span>  
```java
import java.io.Serializable;
import java.util.Objects;

/**
 * IdentityIEnums
 * 可以有多个标识的枚举
 *
 * @author anyOne
 */
public interface IEnums<T extends Serializable> {

    /**
     * 获取枚举的标识
     */
    T[] getIdentities();

    /**
     * 枚举对应的文档，描述
     */
    String getDoc();

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

* 代码复用、继承即可，最终还是调用[一个枚举对应多个标识](#一个枚举对应多个标识)那个工具类  
    ```java
    import ObjectUtils;
    import java.io.Serializable;
    import java.util.Optional;
    
    public interface IEnum<T extends Serializable> extends IEnums<T> {
    
        /**
         * 获取枚举的标识
         */
        T getIdentity();
  
        // 默认实现获取多个标识 
        default T[] getIdentities() {
            return ObjectUtils.array(getIdentity());
        }
    }
    ```  

## 使用例子一

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
ENV test1 = IEnums.getEnum(ENV.class, "test1", RELEASE);
ENV test2 = IEnums.getEnum(ENV.class, "test2", RELEASE);
assert test1 == test2;
```




## 使用例子二

* 工具类
```java
public enum UserType implements IEnum<Integer> {

  NEW_USER(1, "新用户"),

  OLD_USER(0, "老用户");
  public final int code;

  public final String doc;

  UserType(int code, String doc) {
    this.code = code;
    this.doc = doc;
  }

  @Override
  public Integer getIdentity() {
    return code;
  }

  @Override
  public String getDoc() {
    return doc;
  }
}
```

* 使用详情
```java
Optional<UserType> type = IEnums.getEnum(UserType.class, 1);
```

# 总结
在项目中，把我们的枚举统一归纳起来，所有的枚举实现此类接口。这样就可以直接爽快的使用了