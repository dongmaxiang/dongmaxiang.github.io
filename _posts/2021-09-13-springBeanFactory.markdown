---
layout: post
title: springBeanFactory流程解析
permalink: /springBeanFactory
date: 2021-09-13 10:22:28.000000000 +08:00
categories: [java,spring]
tags: [spring,源码]
---

beanFactory用来创建bean的，既然是创建、那么肯定有创建的顺序  
不同的bean实现的接口不同、它的作用也不不同、那么他的加载顺序也不同  
如果bean的类型相同、实现的接口也相同则根据```@Order```注解或者实现```org.springframework.core.Ordered```接口来进行不同的排序
具体可参考[spring对Bean的排序](#spring对Bean的排序)

# bean创建的顺序
不同类型的bean加载的顺序  
1. BeanFactoryPostProcessors  
   优先加载BeanFactoryPostProcessors，该接口是用来往beanFactory中注册bean或修改bean或删除bean。  
   