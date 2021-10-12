---
layout: post
title: jvmClassLoader过程及原理
permalink: /jvmClassLoader过程及原理
date: 2021-10-12 20:52:31.000000000 +08:00
categories: [java,jvm]
tags: [jvm]
---

# 类加载过程
通过类加载器加载，如果已经加载过则不可以再次加载，但是可以通过不同的classLoader加载同一个class

##  都有哪些类加载器呢

###

1. 引导类加载器=BootstrapClassloader  
   是使用C++语言实现的，负责加载JVM虚拟机运行时所需的基本系统级别的类，如java.lang.String, java.lang.Object等等  
   由于是C++实现的所以通过Object.class.getClassLoader() == null,无法访问
   
2. 扩展类加载器=ExtClassLoader  
   是由Bootstrap加载的此类  
   此类加载器默认加载JAVA_HOME/jre/lib/ext/目录下的所有jar包，当然也可以加载由java.ext.dirs系统属性指定的jar包,用来加载java的扩展库，用户也可以直接使用此类加载器
   
3. 应用类加载器=AppClassLoader  
   是由AppClassLoader加载的此类  
   此类加载器默认加载用户编写的class
   

## 双亲委派
意思是多个亲戚，将加载class的任务委任给多个亲戚。以上三个类加载是都是有对应的加载关系的。如果加载某个class时，他会把任务交给上层处理，上层处理不了在交给上层处理，直到上层加载不了，然后在自己加载。  
为什么这样设计呢？比如说String.class，在运行时就已经加载了，我们能重新覆盖吗？并不能，双亲委派机制就是要保证class正常只加载一次    
<font color='red'>上层加载的class不能引用下层加载的class</font>

## URLClassLoader  
扩展类加载器ExtClassLoader和应用类加载器AppClassLoader，都继承`URLClassLoader`，在加载class时根据所在的路径读取class内容加载的。  
如果我们从新写一个String.class，包名和jdk的String一模一样，是加载不了的。因为上层的classLoader已经加载过了。  
如果自己写一个没有加载过的class，可以加载自己写的吗，答案是：和启动时的classPath参数有关


AppClassLoader初始化的代码  
```java
static class AppClassLoader extends URLClassLoader {
   ... 
   public static ClassLoader getAppClassLoader(final ClassLoader var0) throws IOException {
       // 获取classPath
      final String var1 = System.getProperty("java.class.path");
      final File[] var2 = var1 == null ? new File[0] : Launcher.getClassPath(var1);
      return (ClassLoader) AccessController.doPrivileged(new PrivilegedAction<Launcher.AppClassLoader>() {
         public Launcher.AppClassLoader run() {
            URL[] var1x = var1 == null ? new URL[0] : Launcher.pathToURLs(var2);
            // 转换成URL数组，注意当加载class的时候会从此URL寻找，是通过遍历的方式，如果classPath参数中的class靠前，那么就能加载咱们自己写的。
            return new Launcher.AppClassLoader(var1x, var0);
         }
      });
   }
   ...
}
```


# 连接class
1. 验证  
   验证JVM是否支持对应的字节码语法  
   
2. 准备  
   静态变量分配内存空间，并将其赋予默认值（0，false，null等）  
   如：`static int num = 50;`则此步骤为变量num分配空间，并赋值为0   

3. 解析  
   将类中的符号引用转换为直接引用  
   编译的class字节码都是符号引用，符号的意思就是占位符，因为在实际运行当中要知道明确的地址才能调用  
   所以在这个解析的阶段，如果有引用其他的class就会加载其他的class到内存中并初始化，然后才能得到对应的内存地址    
   知道内存地址意味着可以直接调用（也就是直接引用）  


# 初始化class

```java

    static class A {
        static {
            System.out.println("A static");
        }
        A () {
            System.out.println("A constructor");
        }

        static B b = new B();

    }

    static class B {
        static A a = new A();
        static {
            System.out.println("B static");
        }

        B () {
            System.out.println("B constructor");
        }

    }

    @SneakyThrows
    public static void main(String[] args) {
        Class<B> bClass = B.class;
        B b = bClass.newInstance();
    }
```

输出顺序为  
A static  
B constructor  
A constructor  
B static  
B constructor  

## 总结初始化顺序
优先加载引用的class，并初始化static修饰的字段和方法，顺序从上到下  
然后初始化自己的static，也是从上到下  
static初始化完之后，在初始化非static的字段，顺序是优先父类，然后是自己的，顺序也是从上到下  
最后是初始化构造，优先父类的，最后才是自己的
