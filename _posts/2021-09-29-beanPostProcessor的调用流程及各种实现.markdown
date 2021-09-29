---
layout: post
title: beanPostProcessor的调用流程及各种实现
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

## 1. **InstantiationAwareBeanPostProcessor**

* postProcessBeforeInstantiation  
最先调用，可以拦截bean实例化之前（`不包含factoryBean#getObject`），如果返回不为空，则直接调用`BeanPostProcessor`的后置方法并直接返回，此时bean已创建完毕（很少用）

* postProcessAfterInstantiation  
在`postProcessMergedBeanDefinition`之后，返回值为Boolean类型，如果返回为false则不允许自动装配（很少用）

* postProcessProperties  
在`postProcessAfterInstantiation`和springAutowire之后  <br/>
    <font color='red'>最重要的实现AutowiredAnnotationBeanPostProcessor实现自动装配</font>

* postProcessPropertyValues  
如果`postProcessProperties`返回值为null，则会调用此方法  <br/>
    <font color='red'>dubbo注解方式的自动装配：ReferenceAnnotationBeanPostProcessor</font>

---
---

## 2. MergedBeanDefinitionPostProcessor
* postProcessMergedBeanDefinition  
在`postProcessBeforeInstantiation`之后，如果没有拦截实例化、则会通过[beanDefinition](#4-beandefinitionregistry)准备实例化  
实例化之前可以拦截beanDefinition做一些修改，或提取一些信息  
比如说自动装配`@Autowired、@Resource`在这个阶段提取对应的字段或方法并缓存，然后再`postProcessProperties`阶段进行自动装配操作


---
---

## 3. **BeanPostProcessor**

* postProcessBeforeInitialization  
在`postProcessProperties`之后 

* postProcessAfterInitialization  
在`postProcessBeforeInitialization`和初始化方法调用完之后  
如各种Aware的处理，以及`@PostConstruct`方法的调用等

---
---

## 4. **SmartInstantiationAwareBeanPostProcessor**  

* getEarlyBeanReference<br/>    
  <font color='red'>提供早期的引用：如果是单例，并且是循环引用的情况下，最重要的实现InfrastructureAdvisorAutoProxyCreator实现事务aop拦截，且可以循环引用</font>

* predictBeanType  
通过beanName获取class的时候会调用此方法，可以重写此方法，返回bean的类型（返回可以为null）

* determineCandidateConstructors  
Determine the candidate constructors to use for the given bean.(返回可以为null)

---
---

## 5. DestructionAwareBeanPostProcessor
bean在销毁时会调用


# 鸟瞰调用的顺序