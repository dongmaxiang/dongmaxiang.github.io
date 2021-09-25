---
layout: post
title: spring对bean实例化的流程
permalink: /spring对bean实例化的流程
date: 2021-09-22 13:57:47.000000000 +08:00
categories: [java,spring]
tags: [spring,源码]
---

获取bean时，如果不存在则会创建  
spring底层通过name获取对应的bean，如果是根据类型，那么他会先根据类型先获取name，然后根据name在获取bean  
springBean名称可以自定义，如果非自定义默认则是classSimpleName，且第一个字母小写  
FactoryBean的类型也是,如果要获取FactoryBean类型的实例话，则beanName要以"&"为前缀。否则获取的就是factoryBean对应的实际bean  
下下为获取(创建)bean的大体流程  

## 1. 把beanName转换为为标准的beanName
1. 去除"&"的前缀  
   FactoryBean他就是一个普通的bean，在注册beanDefinition时和普通的bean别无二致，只有在获取的时候会有不同。
2. 通过alias获取真实的Name  
   alisa其底层实现其实就是一个map，key为alias，value为实际的beanName

## 2. 根据beanName优先获取单列的bean
优先获取单列，如果非单例的bean压根就获取不到，所以优先获取单列  
> 也可以手动注册单例，但是beanName一样的不允许二次注册(there is already)  
> 手动注册的和spring扫描的且已初始化的单列bean都是存放在同一个地方中：`singletonObjects`  

### 单例bean的获取流程
1. 从`singletonObjects`优先获取单例bean(手动注册的和spring已初始化的都在同一个地方)，有则直接返回，没有则[创建](#3-获取不到bean则创建)  
2. 没有则判断当前的beanName是否为正在创建的单例bean，因为正在创建的bean可能会依赖其他的bean，而其他的bean依赖于正在创建的bean，就变成了一个循环依赖  
   > spring在每创建一个单例bean之前把当前beanName存放在一个set中，标志正在创建中，创建完之后会从Set删除，并把实例放入到`singletonObjects`中  
3. 如果要获取正在创建的bean(循环依赖)，则会从`earlySingletonObjects`中获取  
   > `earlySingletonObjects`是map类型，作用是暂时存放正在创建的bean，key为beanName,value为bean的实例且是由`singletonFactories`提供的  
   > 创建完之后会放入到`singletonObjects`中，并从`earlySingletonObjects`和`singletonFactories`移除  
   > `singletonFactories`由`SmartInstantiationAwareBeanPostProcessor#getEarlyBeanReference`提供早期的引用，如aop返回代理对象的引用  
4. 执行factoryBean的转换

### factoryBean的转换
如果第一步beanName参数是以"&"为前缀，则必须要返回FactoryBean，获取的不是FactoryBean类型的话直接报错  
如果不是"&"前缀，并且获取到的实例为FactoryBean的类型的话，则标记`beanDefinition.isFactoryBean=true`，并调用`FactoryBean#getObject`方法返回真正的对象  

### 工厂bean调用方法`factoryBean#getObject`流程
1. 首先判断是不是`isSingleton`，如果不是则直接调用`getObject`方法并调用`BeanPostProcessor#postProcessAfterInitialization`处理自动装配等逻辑  
2. 如果是singleton`FactoryBean#isSingleton`,则会放入缓存，每次优先取缓存，有则直接返回  
3. 没有缓存则调用`getObject`，把当前beanName存放在一个set中，标志正在创建中,然后调用`BeanPostProcessor#postProcessAfterInitialization`处理自动装配等逻辑,完事放入缓存中，并从set中移除  
  > 如果在`postProcessAfterInitialization`期间又引用了当前的bean的话，则会重新调用`getObject`返回一个新的对象

## 3. 获取不到bean则创建
spring对非单例的循环引用会直接报错```throw new BeanCurrentlyInCreationException(beanName)```  
> 非单例的bean创建之前都会把beanName放入```prototypesCurrentlyInCreation```中，创建过程中如果存在一样的bean名称，视为循环引用，直接报错，没有循环引用最后创建完则从中移除

创建bean，必须需要beanDefinition，没有则`throw new NoSuchBeanDefinitionException`  
   > beanDefinition的注册  
   > 在[beanFactory初始化时](/springBeanFactory流程解析#4-beandefinitionregistry)，通过调用[ConfigurationClassPostProcessor]()向beanFactory中注册符合条件的beanDefinition  

### 创建流程
1. 如果parentBeanFactory不为空，且当前的beanFactory不包含beanDefinition则交由parentBeanFactory处理，[从头开始](#1-把beanname转换为为标准的beanname)
2. 把当前的bean标记为已创建，存放在`alreadyCreated`中，如果`alreadyCreated`不为空，代表beanFactory已开始创建bean
3. 把当前的beanDefinition转换成`RootBeanDefinition`，root是spring创建bean时的视图，包含了父类的信息，算是一个标准，没有他可不行  
   > 获取rootBeanDefinition逻辑时，如果包含内嵌的类，并且内嵌的类非singleton，则外围类的scope同内嵌的类  

4. 确保`dependsOn`的beanName优先[初始化](#1-把beanname转换为为标准的beanname)  
   > `@DependsOn`注解或其他

5. 判断bean的作用域
  首先判断作用域、单例则直接创建，其他作用域则在创建前会把beanName放入```prototypesCurrentlyInCreation```中  
  如果有循环引用直接报错(通过`prototypesCurrentlyInCreation`判断是否包含bean的名称)，单例的循环引用不报错，最后创建完则从中移除  
  > 自定义的作用域(非单例，非`prototype`)，都会从`scopes`中取对应的scope实现，比如servlet实现的session、request  

6. 通过RootBeanDefinition获取真实的class  
如果存在tempClassLoader，则用tempClassLoader加载class，不管用什么，都不会初始化class，除非已经初始化过
>  一旦class已初始化，并且LoadTimeWeaver未加载，那么通过字节码织入的aop对当前的class将会失效

7. 通过`InstantiationAwareBeanPostProcessor`提前实例化  
此类为[`BeanFactoryPostProcessor`](/springBeanFactory流程解析#5-注册拦截bean创建的bean处理器-beanpostprocessor)的子类  

8. 未提前实例化的bean则通过`beanDefinition`获取`BeanWrapper`  
`BeanWrapper`为一个实例的包装，包含了实例所有字段的描述、class信息、设置和获取property等信息  
