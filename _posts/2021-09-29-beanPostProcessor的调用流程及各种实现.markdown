---
layout: post
title: beanPostProcessor的调用顺序及各种实现
permalink: /beanPostProcessor的调用流程及各种实现
date: 2021-09-29 13:04:5.000000000 +08:00
categories: [java,spring]
tags: [spring,源码]
---

在[beanFactory初始化阶段会注册beanPostProcessor](/springBeanFactory流程解析#5-注册拦截bean创建的bean处理器-beanpostprocessor)，它的作用就是在[bean实例化前、后，初始化前、后进行拦截操作](/spring对bean实例化的流程#3-获取不到bean则创建)

# BeanPostProcessor为最顶层的接口
共有5种类型不同作用的间接接口（包含自己）
如图![beanPostProcessor](/assets/images/posts/2021/beanPostProcessor.png)


---

## **InstantiationAwareBeanPostProcessor**

* postProcessBeforeInstantiation  
可以拦截bean实例化之前（`不包含factoryBean#getObject`），如果返回不为空，则直接调用`BeanPostProcessor`的后置方法并直接返回，此时bean已创建完毕（很少用）

* postProcessAfterInstantiation  
返回值为Boolean类型，如果返回为false则不允许自动装配（很少用）

* postProcessProperties  
自动装配，<font color='red'>最重要的实现AutowiredAnnotationBeanPostProcessor实现自动装配</font>

* postProcessPropertyValues  
如果`postProcessProperties`返回值为null，则会调用此方法  <br/>
    自动装配，<font color='red'>dubbo注解方式的自动装配：ReferenceAnnotationBeanPostProcessor</font>

---

## MergedBeanDefinitionPostProcessor
* postProcessMergedBeanDefinition  
在`postProcessBeforeInstantiation`之后，如果没有拦截实例化、则会通过[beanDefinition](/springBeanFactory流程解析#4-beandefinitionregistry)准备实例化  
实例化之前可以拦截beanDefinition做一些修改，或提取一些信息  
比如说自动装配`@Autowired、@Resource`在这个阶段提取对应的字段或方法并缓存，然后再`postProcessProperties`阶段进行自动装配操作


---

## **BeanPostProcessor**

* postProcessBeforeInitialization  
可以替换或set对应的bean，<font color='red'>最重要的实现ApplicationContextAwareProcessor，各种Aware的处理</font>

* postProcessAfterInitialization  
可以替换或set对应的bean  <br/>
  <font color='red'>最重要的实现AbstractAutoProxyCreator实现aop拦截</font>

---

## **SmartInstantiationAwareBeanPostProcessor**  

* getEarlyBeanReference<br/>    
  <font color='red'>提供早期的引用：如果是单例，并且是循环引用的情况下，最重要的实现InfrastructureAdvisorAutoProxyCreator实现事务aop拦截，且可以循环引用</font>

* predictBeanType  
通过beanName获取class的时候会调用此方法，可以重写此方法，返回bean的类型（返回可以为null）

* determineCandidateConstructors  
Determine the candidate constructors to use for the given bean.(返回可以为null)

---

## DestructionAwareBeanPostProcessor
* postProcessBeforeDestruction  
  bean在销毁时会调用


---
---

# 鸟瞰各个方法的调用顺序

## 1. postProcessBeforeInstantiation  
> InstantiationAwareBeanPostProcessor  

在bean实例化的时候调用此方法，如果返回不为空则会调用`postProcessAfterInitialization`并返回，至此后面的流程不在调用
   
## 2. MergedBeanDefinitionPostProcessor
> InstantiationAwareBeanPostProcessor

如果在`postProcessBeforeInstantiation`期间没有被提前实例化，则会调用此方法
   
## 3. getEarlyBeanReference
> SmartInstantiationAwareBeanPostProcessor

这个方法是在单例bean创建的时候通过调用此方法，包装成回调并[放入循环引用中的三级缓存中](/spring对bean实例化的流程#三级缓存)，默认实现AOP:`AbstractAutoProxyCreator`

## 4. postProcessAfterInstantiation  
> InstantiationAwareBeanPostProcessor

如果此方法如果返回false，则不允许自动装配了，换句话说就不会执行第5步了
如果返回true，则要自动装配    
通过`beanDefinition#getResolvedAutowireMode`返回值，可选择的执行spring内置的`autowireByType`或者`autowireByName`  
> 装配的属性必须有set方法，并且只装配在beanFactory中存在的bean，不存在的并不会报错  

## 5. postProcessProperties或postProcessPropertyValues
> InstantiationAwareBeanPostProcessor

spring实例化完bean之后调用`populateBean`进行自动装配  
如果`postProcessProperties`返回为空，则会执行`postProcessPropertyValues`  
默认实现IOC：`AutowiredAnnotationBeanPostProcessor`

## 6. postProcessBeforeInitialization
> BeanPostProcessor

调用此方法之前会优先调用`BeanNameAware,BeanClassLoaderAware,BeanFactoryAware`接口的bean`set...`  

此方法可以替换或set对应的bean，如各种Aware的处理进行set`ApplicationContextAwareProcessor`

## 7. postProcessAfterInitialization
> BeanPostProcessor

调用此方法前优先会调用`InitializingBean`接口的bean`afterPropertiesSet`  
可以替换或set对应的bean，如aop拦截返回代理的bean`AbstractAutoProxyCreator`

---

postProcessBeforeDestruction
bean在销毁的时候会调用，比如说当`spring#close`或者手动destroy时

# 总结
BeanPostProcessor为bean的后置处理器，共有5种不同的后置处理类型，每种后置类型有n多个方法  
IOC`AutowiredAnnotationBeanPostProcessor`和AOP`AbstractAutoProxyCreator`都是通过后置处理完成的实现