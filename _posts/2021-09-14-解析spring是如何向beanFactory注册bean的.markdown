---
layout: post
title: 解析spring是如何向beanFactory注册bean的
permalink: /解析spring是如何向beanFactory注册bean的
date: 2021-09-14 15:44:45.000000000 +08:00
categories: [java,spring]
tags: [spring,源码]
---
ConfigurationClassPostProcessor  
该类是一个BeanFactoryPostProcessor后置处理程序，在springContext初始化的时候通过```AnnotationConfigUtils#registerAnnotationConfigProcessors```向beanFactory注册  
> BeanFactoryPostProcessor：顾名思义，针对beanFactory初始化后的后置处理  
可能针对beanFactory注册一些其他的bean
可能针对beanFactory移除一些bean