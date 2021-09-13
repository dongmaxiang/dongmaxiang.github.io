---
layout: post
title: springBeanFactory流程解析
permalink: /springBeanFactory流程解析
date: 2021-09-13 10:22:28.000000000 +08:00
categories: [java,spring]
tags: [spring,源码]
---

# beanFactory作用
如图![spring-beanFactory](/assets/images/posts/2021/spring-beanFactory.png)
1. BeanFactory主要作用是通过名字或类型get对应的bean实例  
getBean|isTypeMatch|getBeanProvider|getType|getAliases等方法
   
2. SingletonBeanRegistry主要作用是注册单例的bean  
registerSingleton|getSingleton|getSingletonNames等方法
   
3. HierarchicalBeanFactory为可分层的beanFactory主要作用是可以多个beanFactory并且有父子关系
getParentBeanFactory|containsLocalBean只有两个方法
   
4. BeanDefinitionRegistry为注册bean的定义，BeanDefinition是包含了bean的所有信息，包括bean的依赖关系等  
registerBeanDefinition|removeBeanDefinition|getBeanDefinition|getBeanDefinitionNames等方法
   
5. AliasRegistry为注册bean的别名，通过别名也可以获取到bean，主要作用就是注册bean的别名  
registerAlias|removeAlias|getAliases|isAlias只有这四个方法
   
6. ListableBeanFactory为获取一系列满足条件的bean，主要作用通过类型或注解获取对应的bean  
getBeansOfType|getBeanNamesForType|findAnnotationOnBean等方法
   
7. **AutoWireCapableBeanFactory可自动装配的factory**，默认实现```AbstractAutowireCapableBeanFactory#createBean```ioc和aop底层的装配都由它完成  
createBean|initializeBean|  
applyBeanPostProcessorsBeforeInitialization|  
applyBeanPostProcessorsBeforeInitialization等其他方法  
getBean时如果还没有初始化，就会createBean
   
8. ConfigurableListableBeanFactory生产bean时、装配时、类型转化时、冻结、销毁等配置各种各样的组件供方便使用  
ignoreDependencyInterface|freezeConfiguration|isConfigurationFrozen|preInstantiateSingletons|setTypeConverter|destroySingletons等其他方法
   
9. DefaultListableBeanFactory为以上接口的默认实现类

# beanFactory执行(初始)流程-bean的加载顺序
beanFactory用来创建bean的，既然是创建、那么肯定有创建的顺序  
不同的bean实现的接口不同、它的作用也不不同、那么他的加载顺序也不同  
如果bean的类型相同、实现的接口也相同则根据```@Order```注解或者实现```org.springframework.core.Ordered```接口来进行不同的排序  
具体可参考[spring对Bean的排序]({{ "/spring对Bean的排序" | relative_url }})  

## beanFactory工作前的准备工作
1. springContext持有beanFactory，因为spring依靠注解完成强大的框架配置，所以在初始化springContext之后通过AnnotatedBeanDefinitionReader把需要
1. AnnotatedBeanDefinitionReader
1. AnnotatedBeanDefinitionReader
## BeanFactoryPostProcessors  
优先加载BeanFactoryPostProcessors，该接口是用来往beanFactory中注册bean或修改bean或删除bean。  
   