---
layout: post
title: spring对bean实例化的流程-Ioc和Aop的实现
permalink: /spring对bean实例化的流程
date: 2021-09-22 13:57:47.000000000 +08:00
categories: [java,spring]
tags: [spring,源码]
---

获取一个bean时`AbstractBeanFactory#doGetBean`，除非bean已经存在，[否则会通过beanDefinition自动创建](/springBeanFactory流程解析#4-beandefinitionregistry)  

*创建时，如果没有beanDefinition就会报错，所以beanDefinition是一个很重要的存在*

**创建流程很复杂，必须要先了解bean的各种后置处理器[`BeanPostProcessor`](/springBeanFactory流程解析#5-注册拦截bean创建的bean处理器-beanpostprocessor)**  

spring底层通过name获取对应的bean，如果是根据类型，那么他会先根据类型先获取name，然后根据name在获取bean  
beanName可以自定义，如果非自定义默认则是classSimpleName，且第一个字母小写  
> FactoryBean类型的beanName也是同上,如果要获取FactoryBean类型的实例话，则beanName要以"&"为前缀。否则获取的就是factoryBean对应的实际bean

下下为获取(创建)bean的大体流程  

## 1. 通过class类型或注解类型获取beanName
**spring底层[通过name获取对应的bean](#2-根据beanname优先获取单列的bean)**  
如果是注解类型则会遍历所有的beanNames，通过beanNames获取到对应的class，然后然后判断class上是否有相对应的注解  
那么咱们只需要关注如何根据beanName获取到对应class，以及如何根据class获取到对应的beanNames就行  

### 通过beanName获取class流程  
1. 从已初始化的单例bean中获取`singletonObjects`(非循环引用的获取方式)，没有就返回null，有就用返回实例对应的class  
   > 如果是`FactoryBean`则使用`Factory#getObjectType`，否则用`obj.getClass()`直接返回

2. 如果上一步未满足，并且本地不包含beanDefinition，则尝试从[parentBeanFactory中获取](#通过beanname获取class流程)，否则执行下一步  

3. 获取beanDefinition  
   如果不包含beanDefinition则就直接报错  
  通过definition优先获取被包装的definition`getDecoratedDefinition`  
  > 因为有可能目标类将要被代理，在创建beanDefinition的时候就做了手脚,比如说`ScopedProxyUtils#createScopedProxy`：bean的作用域通过代理实现  

5. [获取beanDefinition对应的class](#通过RootBeanDefinition获取真实的class)

6. 执行factoryBean的转换  
  如果参数beanName是以"&"为前缀，代表要获取FactoryBean类型的class，如果上一步获取到的class不是FactoryBean类型，则返回null  
  如果参数beanName不是以"&"为前缀，代表要获取真实bean的类型，如果上一步获取到的不是FactoryBean类型，则直接返回  
  如果是FactoryBean类型，优先根据泛型获取对应的type，如果获取失败则要进行初始化FactoryBean,因为一会要调用`Factory#getObjectType`来返回真实的类型  
  创建流程请参考`AbstractAutowireCapableBeanFactory#createBeanInstance`(包含了构造注入)，会返回一个BeanWrapper  
  > beanDefinition为class定义的各种信息，beanWrapper为实例化之后的各种信息  
  > 初始化完BeanFactory之后(由beanWrapper包装)，并且factoryBean本身是单例的话则会放入缓存中`factoryBeanInstanceCache`[保证不能有二次初始化](#未提前实例化的bean则通过)

### 根据class获取对应的beanNames流程

## 2 根据beanName优先获取单列的bean

### 把beanName转换为为标准的beanName
1. 去除"&"的前缀  
   FactoryBean他就是一个普通的bean，在注册beanDefinition时和普通的bean别无二致，只有在[获取的时候会有不同](#factorybean的转换)
2. 通过alias获取真实的Name  
   alisa其底层实现其实就是一个map，key为alias，value为实际的beanName
   
优先获取单列，如果非单例的bean压根就获取不到，所以优先获取单列  
> 也可以手动注册单例，但是beanName一样的不允许二次注册(there is already)  
> 手动注册的和spring扫描的且已初始化的单列bean都是存放在同一个地方中：`singletonObjects`  

### 单例bean的获取流程
1. 从`singletonObjects`优先获取单例bean(手动注册的和spring已初始化的都在同一个地方)，有则直接返回，没有则[创建](#3-获取不到bean则创建)  
2. 没有则判断当前的beanName是否为正在创建的单例bean，因为正在创建的bean可能会依赖其他的bean，而其他的bean依赖于正在创建的bean，就变成了一个循环依赖  
   > spring在每创建一个单例bean之前把当前beanName存放在一个set中，标志正在创建中，创建完之后会从Set删除，并把创建的实例放入到`singletonObjects`中  
3. 如果要获取正在创建的bean(循环依赖)，则会从`earlySingletonObjects`中获取  
   > `earlySingletonObjects`是map类型，作用是暂时存放正在创建的bean，key为beanName,value为bean的实例且是由`singletonFactories`提供的  
   > 实例创建完之后会放入到`singletonObjects`中，并从`earlySingletonObjects`和`singletonFactories`移除  
   > `singletonFactories`由`SmartInstantiationAwareBeanPostProcessor#getEarlyBeanReference`提供早期的引用，如aop返回代理对象的引用  
4. 执行factoryBean的转换

### factoryBean的转换
如果第一步beanName参数是以"&"为前缀，则必须要返回FactoryBean，获取的不是FactoryBean类型的话直接报错  
如果不是"&"前缀，并且获取到的实例为FactoryBean的类型的话，则标记`beanDefinition.isFactoryBean=true`，并调用`FactoryBean#getObject`方法返回真正的对象  

### 工厂bean调用方法`factoryBean#getObject`流程
1. 首先判断是不是`isSingleton`，如果不是则直接调用`getObject`方法并调用`BeanPostProcessor#postProcessAfterInitialization`此时bean已创建完成（并不会自动装配）  
2. 如果是singleton`FactoryBean#isSingleton`,则会放入缓存，每次优先取缓存，有则直接返回  
3. 没有缓存则调用`getObject`，把当前beanName存放在一个set中，标志正在创建中,然后调用`BeanPostProcessor#postProcessAfterInitialization`此时bean已创建完成（并不会自动装配）,完事放入缓存中，并从set中移除  
  > 如果在`postProcessAfterInitialization`期间又引用了当前的bean的话，则会重新调用`getObject`返回一个新的对象

## 3. 获取不到bean则创建
spring对非单例的循环引用会直接报错```throw new BeanCurrentlyInCreationException(beanName)```  
> 非单例的bean创建之前都会把beanName放入```prototypesCurrentlyInCreation```中，创建过程中如果存在一样的bean名称，视为循环引用，直接报错，没有循环引用最后创建完则从中移除

创建bean，必须需要beanDefinition，没有则`throw new NoSuchBeanDefinitionException`  
   > beanDefinition的注册  
   > 在[beanFactory初始化时](/springBeanFactory流程解析#4-beandefinitionregistry)，通过调用[ConfigurationClassPostProcessor](/解析spring是如何向beanFactory注册bean的)向beanFactory中注册符合条件的beanDefinition  

### 创建流程
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

6. <span id='通过RootBeanDefinition获取真实的class'>通过RootBeanDefinition获取真实的class</span>  
  如果存在tempClassLoader，则用tempClassLoader加载class，不管用什么，都不会初始化class，除非已经初始化过  
  >  一旦class已初始化，并且LoadTimeWeaver未加载，那么通过字节码织入的aop对当前的class将会失效

7. 通过`InstantiationAwareBeanPostProcessor`提前实例化  
  此类为[`BeanPostProcessor`](/springBeanFactory流程解析#5-注册拦截bean创建的bean处理器-beanpostprocessor)的子类  
  可以拦截bean实例化之前（`不包含factoryBean#getObject`），如果返回不为空，则直接调用`BeanPostProcessor`的后置方法并直接返回，此时bean已创建完毕（很少用）  

8. <span id='未提前实例化的bean则通过'>未提前实例化的bean则通过`beanDefinition`获取`BeanWrapper`</span>  
  > beanDefinition为class定义的各种信息，beanWrapper为实例化的包装，包含一个实例的各种信息  