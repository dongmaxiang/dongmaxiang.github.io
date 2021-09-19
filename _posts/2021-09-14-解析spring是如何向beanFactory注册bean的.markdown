---
layout: post
title: 解析spring是如何向beanFactory注册bean的
permalink: /解析spring是如何向beanFactory注册bean的
date: 2021-09-19 19:47:56.000000000 +08:00
categories: [java,spring]
tags: [spring,源码]
---

<big>**ConfigurationClassPostProcessor**</big>  
该类是一个BeanFactoryPostProcessor后置处理程序，其主要功能就是扫描类上(非接口上)的注解进而处理注解对应的职责    
在[spring的refresh阶段](/springBoot容器启动流程)调用[beanFactoryPostProcessors](/springBeanFactory流程解析#4-调用beanfactorypostprocessors)时该类才开始工作  
> 在springContext初始化的时候通过```AnnotationConfigUtils#registerAnnotationConfigProcessors```向beanFactory注册该类  

# 工作流程
该类开始工作时，会扫描beanFactory中已注册的bean, 此时[main方法所在的类已注册到beanFactory中](/springBoot容器启动流程#3-contextprepared--applicationcontextinitializedevent)

**类上必须有```@Configuration```注解**  
1. ```@Component```
   
1. ```@ComponentScan```
   
1. ```@Import```
   
1. ```@ImportResource```
