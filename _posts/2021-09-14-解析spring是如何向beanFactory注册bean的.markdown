---
layout: post
title: 解析spring是如何向beanFactory注册bean的
permalink: /解析spring是如何向beanFactory注册bean的
date: 2021-09-14 15:44:45.000000000 +08:00
categories: [java,spring]
tags: [spring,源码]
---
# 前期流程的准备
ConfigurationClassPostProcessor  
该类是一个BeanFactoryPostProcessor后置处理程序，在springContext初始化的时候通过```AnnotationConfigUtils#registerAnnotationConfigProcessors```向beanFactory注册  
> BeanFactoryPostProcessor：顾名思义，针对beanFactory初始化后的后置处理  
可能针对beanFactory注册一些其他的bean
可能针对beanFactory移除一些bean

在[spring的refresh阶段]({{ "/springBoot容器启动流程" | relative_url }})调用[beanfactorypostprocessors]({{ "/springBeanFactory流程解析#4-调用beanfactorypostprocessors" | relative_url }})时该类才开始工作


# 流程解析