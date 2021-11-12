---
layout: post
title: jvmClassLoader过程及原理
permalink: /jvmClassLoader过程及原理
date: 2021-10-12 20:52:31.000000000 +08:00
categories: [java,jvm]
tags: [jvm]
---

# classLoader加载class过程
都是通过classLoader加载的class，如果已经加载过则不可以再次加载，但是可以通过不同的classLoader加载同一个class

##  都有哪些类加载器呢

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
如果自己写一个没有加载过的class，同时依赖的第三方包中也有这个class，那么可以加载自己写的吗，答案是：和启动时的classPath参数有关


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

---
---

# class加载过程

## 1 加载class
读取class的二进制字节流,默认通过`URLClassLoader#findClass`读取内容  

## 2 连接class  
此步骤由C++实现

### 2.1 验证  
   验证JVM是否支持对应的字节码语法  
   
### 2.2 准备  
   静态变量分配内存空间，并将其赋予默认值（0，false，null等）  
   如：`static int num = 50;`则此步骤为变量num分配空间，并赋值为0  
   如：`static Object obj = 1;`则此步骤为变量obj分配空间，并赋值为null  
   分配内存空间，到底要分配多少呢？详情请看[java内存模型和GC](/java内存模型和GC)  
   如下代码，你猜会输出几？答案是0(默认值)，为什么呢？  
   ```java
static class Test {
   static final Test t = new Test();
   static int eight = 8;
   private int num = eight;
   
   public static void main(String[] args) {
      System.out.println(Test.t.num);
   }
}
 ```  
   为什么输出是0，而不是8？看完初始化你就明白了

            
            
### 2.3 解析  
   将类中的符号引用转换为直接引用  
   编译的class字节码都是符号引用，符号的意思就是占位符，因为在实际运行当中要知道明确的地址才能调用  
   所以在这个解析的阶段，如果有引用其他的class就会加载其他的class到内存中，然后才能得到对应的内存地址    
   知道内存地址意味着可以直接调用（也就是直接引用）  


## 3 初始化class  

```java
import lombok.SneakyThrows;

public class Test {

   static class A {
      static {
         System.out.println("class A initialize ");
      }
      A() {
         System.out.println("A constructor");
      }
      static B b = new B();
      static {
         System.out.println("A static after new B(), f_o_12:" + B.f_o_12);
         System.out.println("A static after new B(), b.num:" + b.num);
      }
   }
   static class B extends A {
      static {
         System.out.println("class B initialize ");
      }
      public static final int psf_1 = 1;
      static final int f_2 = 2;
      // ---------------------------
      public static final Object f_o_12 = 12;
      // ---------------------------
      static B b = new B();
      static int num_constant = 999999999;
      public int num = num_constant;
      static {
         System.out.println("B  static after new B(), f_o_12:" + B.f_o_12);
      }
      B() {
         System.out.println("B constructor");
      }
   }

   @SneakyThrows
   public static void main(String[] args) {
      System.out.println(B.psf_1);
      System.out.println(B.f_2);
      System.out.println(B.f_o_12);
   }
}
```  

运行main方法，如果不看答案的话你能准确的说出他的输出内容及顺序吗？  
即使你看过网上一大堆的初始化文章之后，98%的人都答不对,先透露一下总共输出12个，最后几个输出的是  
第11个输出: B  static after new B(), f_o_12:12  
第12输出: 12


<select>
<option>点我查看答案</option>
<option>1. 1 </option>
<option>2. 2 </option>
<option>3. class A initialize </option>
<option>4. A constructor </option>
<option>5. B constructor </option>
<option>6. A static after new B(), f_o_12:null </option>
<option>7. A static after new B(), b.num:0 </option>
<option>8. class B initialize </option>
<option>9. A constructor </option>
<option>10. B constructor </option>
<option>11. B  static after new B(), f_o_12:12 </option>
<option>12. 12 </option>
</select>


### 总结初始化顺序

1. 优先级最高的：如果是<font color='red'>static final 修饰的Java 基本类型</font>则不会初始化class，可以直接访问，称之为常量  
   
2. 如果是访问static的变量或者是new对象，优先初始化顶级父类的 static 修饰的静态字段或静态块，按照声明的顺序初始化，然后是子类，依次到当前的class  
  如果static声明的字段或者方法块引用到其他的class，则会初始化其对应的class，如果已经或正在初始化，可以直接使用  
  注意：[<font color='red'>如果正在初始化，则class的内容只做了准备的阶段，所以class里面的属性都是null或者都是默认值</font>](#22-准备)  
   
3. 如果是创建对象的实例，则上面的静态块初始化完毕之后，在初始化代码块（从顶级的父类开始，按照声明的顺序，然后是子类，依次到当前的class），最后是构造方法初始化

