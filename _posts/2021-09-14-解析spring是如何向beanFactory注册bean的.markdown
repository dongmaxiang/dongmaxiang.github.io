---
layout: post
title: 解析spring是如何向beanFactory注册bean的
permalink: /解析spring是如何向beanFactory注册bean的
date: 2021-09-19 19:47:56.000000000 +08:00
categories: [java,spring]
tags: [spring,源码]
---

# 背景  

<big>**ConfigurationClassPostProcessor**</big>  
该类是一个BeanFactoryPostProcessor后置处理程序，其主要功能就是扫描beanFactory已注册的bean上的注解进而处理注解对应的职责    
在[spring的refresh阶段](/springBoot容器启动流程)调用[beanFactoryPostProcessors](/springBeanFactory流程解析#4-调用beanfactorypostprocessors)时该类才开始工作  
> 在springContext初始化的时候通过```AnnotationConfigUtils#registerAnnotationConfigProcessors```向beanFactory注册该类  

# 工作流程

## 1. 挨个挨个扫描beanFactory中的未扫描的bean
该类开始工作时，[main方法所在的类已注册到beanFactory中](/springBoot容器启动流程#3-contextprepared--applicationcontextinitializedevent)  
先开始扫描main方法所在的类，并执行以下步骤2、3、4、5、6、7、8...等全部步骤，执行过程中会有新的bean注册到beanFactory中  
然后再从beanFactory获取所有beanNames```getBeanDefinitionNames```,过滤未扫描的bean继续扫描，直到扫完为止  

每扫一个bean执行完全部步骤之后都会
>* 执行在扫描期间扫描到的注解[@Import需延后执行的-DeferredImportSelector](#deferredimportselector)现在立马执行  
>* 遍历[```configurationClasses```](#3-通过conditionevaluator判断是否满足条件)，过滤已经解析过的，然后执行以下步骤  
> 1. 通过```ConditionEvaluator```判断是否满足注册条件(<small>在```ConfigurationPhase.REGISTER_BEAN```执行期间</small>)，不满足则return;
> 1. 如果是内嵌类、或者是`@Import`的类，则会被作为一个`@Configuration`注解的类，注册到beanFactory中(内嵌的类有其他注解则以其他注解优先，参考步骤2的注解)  
> 1. 注册扫描期间扫描到的@Bean注解的方法，会通过`ConditionEvaluator`判断是否满足条件(<small>在```ConfigurationPhase.REGISTER_BEAN```执行期间</small>)  
> 1. 执行扫描期间扫描到的[@ImportResource对应的资源](#8-遇到importresource注解时)现在进行资源的解析  
> 1. 执行在扫描期间扫描到的注解[@Import需延后执行的-ImportBeanDefinitionRegistrar](#importbeandefinitionregistrar)现在立马执行 

## 2. 如果class没有配置注解的话直接跳过
必须包含@Configuration或@Component、@PropertySources、@ComponentScan、@Import、@ImportResource或方法上有@Bean注解的  
注解上包含以上注解的也可以---称之为复合注解（组合注解）

## 3. 通过```ConditionEvaluator```判断是否满足条件  
如果条件不满足(<small>在```ConfigurationPhase.PARSE_CONFIGURATION```期间</small>)则跳过，然后扫描下一个bean，继续从步骤1开始  
> 如@ConditionOnBean、@ConditionOnClass、@ConditionMiss...等  

条件满足则会判断是不是已经被扫描过，如果没有扫描则接着处理4、5、6。。。之后的全部步骤  
**<font color='red'>并把当前扫描的类保存到</font>`configurationClasses`<font color='red'>中</font>**  

如果已经被扫描过，则优先处理非导入的，如果都是被导入的，则会合并  
## 4. 遇到```@Component```注解时优先处理内嵌的类继续循环2、3、4步骤
内嵌的类作为一个被导入的类

## 5. 遇到```@PropertySources、@PropertySource```注解时处理配置文件并添加到environment中

## 6. 遇到```@ComponentScans、@ComponentScan```注解时扫描对应的basePackages或basePackageClasses
@ComponentScan扫描的class会注册到beanFactory中并且继续循环2、3、4、5、6的步骤，但必须满足以下几个条件  
* 扫描指定的包下面所有的class时必须有@Component注解或者@ManagedBean  
> 该条件通过```ClassPathScanningCandidateComponentProvider#registerDefaultFilters```注册  
* 通过[```ConditionEvaluator```](#2-通过conditionevaluator判断是否满足条件)判断是否可以注册到beanFactory中
* 非接口、非abstract、并且为 top-level class or a nested class (static inner class),或者为abstract的类中必须有方法上是```@Lookup```注解的
* 未往beanFactory注册过的

## 7. 遇到```@Import```注解时进行导入操作
@Import可以导入任何一个类，作为一个被导入的类，继续循环2、3、4、5、6、7的步骤,但是注意有三种类型比较特殊  
> 在本步骤处理import时，不想相互import。例如：A import B，如果 B 在 import A就会报错

### ImportSelector  
  此类型的实现通过调用selectImports获取import的类全名称(可以为多个)，挨个循环继续执行步骤7
  > 实现此类的有：  
  > @EnableTransactionManagement-TransactionManagementConfigurationSelector-事务管理器  
  > @EnableAsync-AsyncConfigurationSelector-开启异步  
  > @EnableCaching-CachingConfigurationSelector-开启缓存  
  
### DeferredImportSelector
  作用同ImportSelector，但是是延后处理，调用时机在[步骤1](#1-挨个挨个扫描beanfactory中的未扫描的bean)扫描bean执行完全部的步骤之后才会调用  
  > 实现此类的有：  
  > @EnableAutoConfiguration-AutoConfigurationImportSelector-开启自动配置  
  > @ImportAutoConfiguration-ImportAutoConfigurationImportSelector-通过springSpi自定义具体的实现  
  
### ImportBeanDefinitionRegistrar
  也是延后处理，调用时机在[步骤1](#1-挨个挨个扫描beanfactory中的未扫描的bean)扫描bean执行完全部的步骤之后才会调用  
  不同于[ImportSelector](#importselector)此接口需要使用者自己往beanFactory注册bean，注册之前会有注解相关的信息供使用者使用  
  > 实现此类的有：  
  > @EnableAspectJAutoProxy-AspectJAutoProxyRegistrar-aop拦截符合条件的类  
  > @EnableConfigurationProperties-EnableConfigurationPropertiesRegistrar-配置实体和配置文件的映射（配置文件类）  
  
## 8. 遇到```@ImportResource```注解时
  @ImportResource用来导入一个资源文件如早期的spring-application.xml的配置文件  
  但是资源并不会立马解析，也是延后处理，调用时机也是在[步骤1](#1-挨个挨个扫描beanfactory中的未扫描的bean)扫描bean执行完全部的步骤之后才会解析此资源

## 9. 收集当前扫描的class中有@Bean注解的方法(包含接口上有此注解的方法)


## 10. 继续扫描当前class的父类，直到为Object为止
继续从步骤2开始
  
# 总结