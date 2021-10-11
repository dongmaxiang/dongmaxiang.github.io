---
layout: post
title: java-agent
permalink: /java-agent
date: 2021-10-10 17:43:40.000000000 +08:00
categories: [java,jvm]
tags: [jvm]
---

# 简介
* 什么是java-agent、作用是什么、怎么用、原理是什么? 

java-agent可以理解为是一个代理程序，非主程序，代理程序可以做的事情就很多了，取决于你想写什么逻辑  
比如说[Alibaba开源的Java诊断工具](https://arthas.aliyun.com/doc/)  
也可以动态的替换字节码，实现代码热更新的效果  

---
---

# 原理
通过java-agent程序我们可以获取到`Instrumentation`实例，得到此实例之后可以干的事情就很多了，比如说aop字节码增强，或者重新定义class等  
> 具体原理可参考   
> 1：[美团的技术分享-agent原理](https://tech.meituan.com/2019/11/07/java-dynamic-debugging-technology.html)  
> 2：[美团的技术分享-字节码增强原理](https://tech.meituan.com/2019/09/05/java-bytecode-enhancement.html)

1. agent程序可以在主程序启动之前启动，做你想做的操作,需要编写逻辑代码并封装成Jar包，并在jvm 启动命令添加 -\[javaagent|agentlib]:agentJar包的路径   
  jar包中的class方法signature必须为 `public static void premain(String agentArgs, Instrumentation inst)`

2. 也可以在主程序运行过程中启动，jdk1.6之后才可以，通过jdk自带的方法`VirtualMachine#attach.loadAgent("你封装的agentJar包路径")`  
  jar包中的class方法signature必须为 `public static void agentmain(String agentArgs, Instrumentation inst)`

```java
public interface Instrumentation {
    // 添加class转换器，在class加载的时候可以修改class字节码
    void addTransformer(ClassFileTransformer transformer, boolean canRetransform);

    boolean removeTransformer(ClassFileTransformer transformer);

    boolean isRetransformClassesSupported();

    void retransformClasses(Class<?>... classes) throws UnmodifiableClassException;

    boolean isRedefineClassesSupported();

    // 重新定义class
    void redefineClasses(ClassDefinition... definitions) throws  ClassNotFoundException, UnmodifiableClassException;

    boolean isModifiableClass(Class<?> theClass);

    Class[] getAllLoadedClasses();

    Class[] getInitiatedClasses(ClassLoader loader);

    long getObjectSize(Object objectToSize);

    void appendToBootstrapClassLoaderSearch(JarFile jarfile);

    void appendToSystemClassLoaderSearch(JarFile jarfile);

    boolean isNativeMethodPrefixSupported();

    void setNativeMethodPrefix(ClassFileTransformer transformer, String prefix);
}
```

## 具体使用  

* java代码  
  ```java
  public final class DynamicInstrumentationAgent {
  
      private DynamicInstrumentationAgent() {
      }
  
      public static void premain(final String args, final Instrumentation inst) throws Exception {
          ...
          // 拿着inst可以干很多事情，比如说替换字节码等
      }
  
      public static void agentmain(final String args, final Instrumentation inst) throws Exception {
          premain(args, inst);
      }
  
  }
  ```

* MANIFEST.MF  
  ```manifest
  
  Manifest-Version: 1.0
  Premain-Class: DynamicInstrumentationAgent
  Agent-Class: DynamicInstrumentationAgent
  Can-Redefine-Classes: true
  Can-Retransform-Classes: true
  
  ```

* 打成jar包  
把java代码和MANIFEST.MF打成jar包，并把MANIFEST.MF放在META-INF目录下即可


---
---

# agent实现热更新
* 获取到`Instrumentation`实例之后调用`redefineClasses(ClassDefinition definition)`重新定义class字节码实现热更新
  热更新底层原理可[参考其他文章](https://www.cnblogs.com/zyl2016/p/13666945.html)
  > ClassDefinition包含了老的class和新的class字节码

不是说class一旦加载之后就不能修改吗？为什么agent却可以啊  
原来是部分不能修改，不能增删改字段成员和方法的signature，只能修改方法体的内容  
如果觉得只能修改方法体太局限，[可以参考springRemoteRestart](/解决springRemoteRestart不起作用#重新启动)  
为什么只能修改方法体呢？[参考其他文章](https://www.cnblogs.com/zyl2016/p/13666945.html)