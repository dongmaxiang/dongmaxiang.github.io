---
layout: post
title: spring对bean实例化的流程-Ioc和Aop的底层实现
permalink: /spring对bean实例化的流程
date: 2021-09-22 13:57:47.000000000 +08:00
categories: [java,spring]
tags: [spring,源码]
---

获取一个bean时`AbstractBeanFactory#doGetBean`，除非bean已经存在，否则会通过beanDefinition自动创建  

创建时，[如果没有beanDefinition就会报错，所以beanDefinition是一个很重要的存在](/springBeanFactory流程解析#4-beandefinitionregistry)

**创建流程很复杂，必须要先了解bean的各种后置处理器[`BeanPostProcessor`](/beanPostProcessor的调用流程及各种实现)**  

spring获取bean时,底层是通过beanName获取的，如果是根据类型，那么他会先根据类型先获取name，然后根据name在获取bean  
> beanName可以自定义，如果非自定义默认则是classSimpleName，且第一个字母小写  
> FactoryBean类型的beanName也是同上,如果要获取FactoryBean类型的实例话，则beanName要以"&"为前缀。否则获取的就是factoryBean对应的实际bean

以下为获取(创建)bean的大体流程

---

## 1. 通过class类型或注解类型获取beanName
**不管怎样，spring底层是[通过name获取对应的bean](#2-根据beanname优先获取单列的bean)**  
如果是根据注解获取bean，底层则会遍历所有的beanNames，通过beanNames获取到对应的class，然后然后判断class上是否有相对应的注解  
那么咱们只需要关注如何根据beanName获取到对应class，以及如何根据class获取到对应的beanNames就行  

---

### 通过beanName获取class流程  
1. 从已初始化的单例bean`singletonObjects`中获取(不允许早期初始化-非循环依赖的方式获取)，没有就返回null，有就用返回实例对应的class  
   > 如果是`FactoryBean`则使用`Factory#getObjectType`，否则用`obj.getClass()`直接返回

2. 如果上一步未满足，并且本地不包含beanDefinition，则尝试从[parentBeanFactory中获取](#通过beanname获取class流程)，否则执行下一步  

3. 获取beanDefinition  
  如果不包含beanDefinition则就直接报错  
  通过definition优先获取被包装的definition`getDecoratedDefinition`  
  > 因为有可能目标类将要被代理，在创建beanDefinition的时候就做了手脚,比如说`ScopedProxyUtils#createScopedProxy`：bean的作用域通过代理实现  

5. [获取beanDefinition对应的class](#通过rootbeandefinition获取真实的class)  
最后通过[`SmartInstantiationAwareBeanPostProcessor#predictBeanType`](/beanPostProcessor的调用流程及各种实现#4-smartinstantiationawarebeanpostprocessor)返回对应的beanType

6. 执行factoryBean的转换  
  如果参数beanName是以"&"为前缀，代表要获取FactoryBean类型的class，如果上一步获取到的class不是FactoryBean类型，则返回null  
  如果参数beanName不是以"&"为前缀，代表要获取真实bean的类型，如果上一步获取到的不是FactoryBean类型，则直接返回，如果是FactoryBean类型，优先根据泛型获取对应的type，如果获取失败则要进行初始化FactoryBean,因为一会要调用`Factory#getObjectType`来返回真实的类型  
  创建流程请参考[`AbstractAutowireCapableBeanFactory#createBeanInstance`](#创建beanwrapper)(包含构造注入流程)，完事会返回一个BeanWrapper，如果factoryBean本身是单例的话则会放入缓存中`factoryBeanInstanceCache`，[在获取bean的时候，保证不能有二次初始化](#缓存取对应的beanwrapper)
  > beanDefinition为class定义的各种信息，beanWrapper为实例化之后的各种信息  

---

### 通过class获取对应的beanNames流程
1. 获取所有已注册的beanDefinitionNames和手动注册的单例beanNames(手动注册的已初始化)  
  条件包含：非alias、非abstract、且是否包含非单例、是否允许早期初始化两个动态条件

2. 依次遍历beanName

3. 通过[beanName获取class](#通过beanname获取class流程)  
  与'通过beanName获取class流程'大体流程一致，但是有些许的不同，比如没有beanDefinition不会报错，如果是FactoryBean则尽量不初始化的情况下获取到对应的targetType，否则只能初始化并调用`getTargetType`

5. 判断获取到的class  
   * 如果没有获取到class则为false,代表不匹配  
   * 获取到class之后调用`isInstance`  
       如果返回true则会把当前的beanName添加到list里面，最后一并返回  
       如果为false，并且当前的beanName的类型为FactoryBean类型则会拼接'&'前缀作为beanName从新判断  

---
---

## 2 根据beanName优先获取单列的bean

---

### 把beanName转换为为标准的beanName
1. 去除"&"的前缀  
   FactoryBean他就是一个普通的bean，在注册beanDefinition时和普通的bean别无二致，只有在[获取的时候会有不同](#factorybean的转换)
2. 通过alias获取真实的Name  
   alisa其底层实现其实就是一个map，key为alias，value为实际的beanName
   
优先获取单列，如果非单例的bean压根就获取不到，所以优先获取单列  
> 也可以手动注册单例，但是一样的beanName不允许二次注册(there is already)  
> 手动注册的和spring扫描的且已初始化的单列bean都是存放在同一个地方中：`singletonObjects`  

---

### 单例bean的获取流程
1. 从`singletonObjects`优先获取单例bean(手动注册的和spring已初始化的都在同一个地方)，有则直接返回  
2. 没有则判断当前的beanName是否为正在创建的单例bean，因为正在创建的bean可能会依赖其他的bean，而其他的bean依赖于正在创建的bean，就变成了一个循环依赖  
   > spring在每创建一个单例bean之前把当前beanName存放在一个set中，标志正在创建中，创建完之后会从Set删除，并把创建的实例放入到`singletonObjects`中  

3. 如果当前获取的bean正在创建(循环依赖)，则会从`earlySingletonObjects`中获取  
   > `earlySingletonObjects`是map类型，作用是暂时存放正在创建的bean，key为beanName,value为bean的实例且是由`singletonFactories`提供的  

4. 如果`earlySingletonObjects`获取为空，且允许早期的引用(循环依赖)则从[`singletonFactories`](#单例的bean放入三级缓存中)中获取  
   `singletonFactories`由`SmartInstantiationAwareBeanPostProcessor#getEarlyBeanReference`提供早期的引用，如aop返回代理对象的引用  
   > 等实例创建完之后会放入到`singletonObjects`中，并从`earlySingletonObjects`和`singletonFactories`移除  

5. 执行factoryBean的转换

<span id='三级缓存'/>
> 其实单例bean获取的时候就已经解决了循环依赖，以上的各个变量就是网上说的三级缓存，如果还不太理解可以直观的看下代码  
```java
public class DefaultSingletonBeanRegistry extends SimpleAliasRegistry implements SingletonBeanRegistry {
    ...
    public Object getSingleton(String beanName) {
        return getSingleton(beanName, true);
    }
    protected Object getSingleton(String beanName, boolean allowEarlyReference) {
        Object singletonObject = this.singletonObjects.get(beanName);// 一级缓存，所有已初始化完的单例bean都在这里
        if (singletonObject == null && isSingletonCurrentlyInCreation(beanName)) {// 当前bean正在创建中
            singletonObject = this.earlySingletonObjects.get(beanName);// 二级缓存，第一次访问肯定是空的，二级缓存的值由三级缓存提供
            if (singletonObject == null && allowEarlyReference) {
                synchronized (this.singletonObjects) { // 上锁
                    singletonObject = this.singletonObjects.get(beanName); // 再次查看一级缓存
                    if (singletonObject == null) {
                        singletonObject = this.earlySingletonObjects.get(beanName); // 再次查看二级缓存
                        if (singletonObject == null) {
                            // 调用三级缓存，三级缓存是在bean创建的时候放进去的，并且value为ObjectFactory，只有在需要的时候才会初始化
                            ObjectFactory<?> singletonFactory = this.singletonFactories.get(beanName); 
                            if (singletonFactory != null) {
                                singletonObject = singletonFactory.getObject();
                                this.earlySingletonObjects.put(beanName, singletonObject);// 放入二级缓存中
                                this.singletonFactories.remove(beanName); // 最后要移除三级缓存
                            }
                        }
                    }
                }
            }
        }
        return singletonObject;
    }
    ...
}
```

---

### factoryBean的转换
如果第一步beanName参数是以"&"为前缀，则必须要返回FactoryBean，获取的不是FactoryBean类型的话直接报错  
如果不是"&"前缀，并且获取到的实例为FactoryBean的类型的话，则标记`beanDefinition.isFactoryBean=true`，并调用`FactoryBean#getObject`方法返回真正的对象  

---

### 工厂bean调用方法`factoryBean#getObject`流程
1. 首先判断是不是`isSingleton`，如果不是则直接调用`getObject`方法并调用`BeanPostProcessor#postProcessAfterInitialization`此时bean已创建完成（并不会自动装配）  
2. 如果是singleton`FactoryBean#isSingleton`,则会放入缓存，每次优先取缓存，有则直接返回  
3. 没有缓存则调用`getObject`，把当前beanName存放在一个set中，标志正在创建中,然后调用`BeanPostProcessor#postProcessAfterInitialization`此时bean已创建完成（并不会自动装配）,完事放入缓存中，并从set中移除  
  > 如果在`postProcessAfterInitialization`期间又引用了当前的bean的话，则会重新调用`getObject`返回一个新的对象

---
---

## 3. 获取不到bean则创建
spring对非单例的循环引用会直接报错```throw new BeanCurrentlyInCreationException(beanName)```  
> 非单例的bean创建之前都会把beanName放入```prototypesCurrentlyInCreation```中，创建过程中如果存在一样的bean名称，视为循环引用，直接报错，没有循环引用最后创建完则从中移除

创建bean，必须需要beanDefinition，没有则`throw new NoSuchBeanDefinitionException`  
   > beanDefinition的注册  
   > 在[beanFactory初始化时](/springBeanFactory流程解析#4-beandefinitionregistry)，通过调用[ConfigurationClassPostProcessor](/解析spring是如何向beanFactory注册bean的)向beanFactory中注册符合条件的beanDefinition  

---

### 创建bean时的前期流程
1. 如果parentBeanFactory不为空，且当前的beanFactory不包含beanDefinition则交由parentBeanFactory处理，[从头开始](#把beanname转换为为标准的beanname)  
   
2. 把当前的bean标记为已创建，存放在`alreadyCreated`中，如果`alreadyCreated`不为空，代表beanFactory已开始创建bean  
   
3. 把当前的beanDefinition转换成`RootBeanDefinition`，root是spring创建bean时的视图，包含了父类的信息，算是一个标准，没有他可不行  
  > 获取rootBeanDefinition逻辑时，如果包含内嵌的类，并且内嵌的类非singleton，则外围类的scope同内嵌的类  

4. 确保`dependsOn`的beanName优先[初始化](#把beanname转换为为标准的beanname)  
  > `@DependsOn`注解或其他配置等

5. 判断bean的作用域  
  首先判断作用域，非单例的其他作用域则在创建前会把beanName放入```prototypesCurrentlyInCreation```中  
  如果有循环引用直接报错(通过`prototypesCurrentlyInCreation`判断是否包含bean的名称)，单例的循环引用不报错，最后创建完则从中移除  
  > 自定义的作用域(非单例，非`prototype`)，都会从`scopes`中取对应的scope实现，比如servlet实现的session、request  

---

### 通过RootBeanDefinition获取真实的class
如果是FactoryMethod则会通过反射获取方法上返回的类型  
如果存在tempClassLoader，则用tempClassLoader加载class，不管用什么，都不会初始化class，除非已经初始化过
>  一旦class已初始化，并且LoadTimeWeaver未加载，那么通过字节码织入的aop对当前的class将会失效

---

### 通过`InstantiationAwareBeanPostProcessor`提前实例化  
此类为[`BeanPostProcessor`](/beanPostProcessor的调用流程及各种实现#instantiationawarebeanpostprocessor)的子类  
可以拦截bean实例化之前（`不包含factoryBean#getObject`），如果返回不为空，则直接调用`BeanPostProcessor`的后置方法并直接返回，此时bean已创建完毕（很少用）  

---

### 创建beanWrapper
未提前实例化的bean则通过`beanDefinition`获取`BeanWrapper`  
`beanDefinition`为class定义的各种信息，`beanWrapper`为实例化的包装，包含一个实例的各种信息  
要考虑到factoryBean有可能已经初始化过[在根据beanName获取class的过程中](#通过beanname获取class流程)）,所以优先从缓存<span id='缓存取对应的beanWrapper'>/'`factoryBeanInstanceCache`取对应的beanWrapper，没有则会创建  
beanWrapper流程会通过beanDefinition解析是否可以通过无参构造进行构造，否则只能进行有参构造

---

### 单例的bean放入三级缓存中
如果是单例，则通过[`SmartInstantiationAwareBeanPostProcessor`](/beanPostProcessor的调用流程及各种实现#3-getearlybeanreference)提供早期的引用,并放入三级缓存`singletonFactories`中  
等bean初始化完之后如果三级缓存中的bean也初始化了，说明当前bean有循环引用，则用三级缓存中的bean  

---

### 自动装配和初始化方法调用  
自动装配、初始化方法调用等都是通过beanPostProcessor来实现的  
执行[beanPostProcessor](/beanPostProcessor的调用流程及各种实现#4-postprocessafterinstantiation)第四步后面的流程  
至此bean实例化、初始化完毕。如果是单例的bean则会放到`singletonObjects`中，缓存起来