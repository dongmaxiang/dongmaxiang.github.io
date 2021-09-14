---
layout: post
title: spring对Bean的排序
permalink: /spring对Bean的排序
date: 2021-09-13 11:29:56.000000000 +08:00
categories: [java,spring]
tags: [spring,源码]
---

# 大体流程
不同的bean实现的接口不同、它的作用也不不同、那么他的加载顺序也不同  
具体可参考[beanFactory对不同类型的bean加载的顺序]({{ "/springBeanFactory流程解析#4-调用beanfactorypostprocessors" | relative_url }})  

如果bean的类型相同、实现的接口也相同则根据
1. 实现```org.springframework.core.PriorityOrdered```接口
1. 实现```org.springframework.core.Ordered```接口
1. 注解```@Order```
1. 注解```@Priority```  

以上优先级从高到低  
接口优先级比注解的高  
如果都是接口PriorityOrdered优先级更高  
如果都是注解@Order优先级更高  
**数值越小的优先级就越高**
# 代码流程

具体可参考```org.springframework.core.OrderComparator```
> 默认的排序（不支持注解）

具体可参考```org.springframework.core.annotation.AnnotationAwareOrderComparator```
> 支持注解的排序

具体可参考```org.springframework.core.annotation.OrderUtils```
> 获取注解

spring 中对bean的排序用的是```org.springframework.core.annotation.AnnotationAwareOrderComparator#INSTANCE```
## spring初始化context时会把排序的类注册到beanFactory中
```java
if (!(beanFactory.getDependencyComparator() instanceof AnnotationAwareOrderComparator)) {
    beanFactory.setDependencyComparator(AnnotationAwareOrderComparator.INSTANCE);
}
```