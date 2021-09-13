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
## 1. BeanFactory
> 主要作用是通过名字或类型get对应的bean实例

getBean|isTypeMatch|getBeanProvider|getType|getAliases等方法
   
## 2. SingletonBeanRegistry
> 主要作用是注册单例的bean  

registerSingleton|getSingleton|getSingletonNames等方法
   
## 3. HierarchicalBeanFactory
> 可分层的beanFactory主要作用是可以多个beanFactory并且有父子关系

getParentBeanFactory|containsLocalBean 只有两个方法
   
## 4. BeanDefinitionRegistry
> 注册bean的定义:BeanDefinition是包含了bean的所有信息，包括bean的依赖关系等  

registerBeanDefinition|removeBeanDefinition|getBeanDefinition|getBeanDefinitionNames 等方法
   
## 5. AliasRegistry
> 为注册bean的别名，通过别名也可以获取到bean，主要作用就是注册bean的别名  

registerAlias|removeAlias|getAliases|isAlias 只有这四个方法
   
## 6. ListableBeanFactory
> 为获取一系列满足条件的bean，主要作用通过类型或注解获取对应的bean  

getBeansOfType|getBeanNamesForType|findAnnotationOnBean 等方法
   
## 7. AutoWireCapableBeanFactory
> 可自动装配的factory，默认实现```AbstractAutowireCapableBeanFactory#createBean```ioc和aop底层的装配都由它完成  

createBean|initializeBean|applyBeanPostProcessorsBeforeInitialization|applyBeanPostProcessorsBeforeInitialization等其他方法

[getBean](#1-beanfactory)时如果还没有初始化，就会createBean

## 8. ConfigurableListableBeanFactory和ConfigurableBeanFactory  
> 生产bean时、装配时、类型转化时、销毁bean、冻结等配置各种各样的组件供方便使用

registerResolvableDependency|ignoreDependencyInterface|
registerScope|getRegisteredScope|  
freezeConfiguration|isConfigurationFrozen|  
preInstantiateSingletons|destroySingletons|
setTypeConverter|setConversionService等其他方法  

> **registerResolvableDependency(Class<?> dependencyType, @Nullable Object autowiredValue);**  
>   注册一个bean，其他依赖此类型的，可以直接用，autowiredValue不会放到bean工厂中，只会为其他类提供依赖  
> **void ignoreDependencyInterface(Class<?> ifc);**  
>   自动装配时忽略ifc类型的接口，通常配合beanFactory的addBeanPostProcessor一起使用。当bean初始化完后，BeanPostProcessor专门处理忽略ifc类型的字段  
> **void registerScope(String scopeName, Scope scope);**  
>   除单例和prototype之外有request、session等bean的生命周期定义都是由这个方法完成注册。通过Scope接口中的get方法获取bean
   
## 9. DefaultListableBeanFactory为以上接口的默认实现类

# beanFactory初始流程

在[springBoot的refresh阶段]({{ "/springBoot容器启动流程" | relative_url }})操作beanFactory完成对bean的扫描、组装、初始化等逻辑

## 大体流程

1. 获取beanFactory  
   context初始化时就自动创建好了。默认实现```org.springframework.beans.factory.support.DefaultListableBeanFactory```  
   ```this.beanFactory = new DefaultListableBeanFactory()```
   
1. 准备beanFactory  
   beanFactory是刚new出来，没有经过配置，prepareBeanFactory方法对beanFactory进行一些简单的配置
   如调用[registerResolvableDependency](#8-configurablelistablebeanfactory和configurablebeanfactory)注册BeanFactory、ApplicationContext等

1. 交给context实现类去配置beanFactory  
   例如：如果是servletBeanApplicationContext会对beanFactory增加额外的[Scope](#8-configurablelistablebeanfactory和configurablebeanfactory)，比如RequestScope、SessionScope等

## 代码流程
```java
public abstract class AbstractApplicationContext extends DefaultResourceLoader implements ConfigurableApplicationContext {
    ...
    public void refresh() throws BeansException, IllegalStateException {
        synchronized (this.startupShutdownMonitor) {
            ...
            // Tell the subclass to refresh the internal bean factory.
            ConfigurableListableBeanFactory beanFactory = obtainFreshBeanFactory();

            // Prepare the bean factory for use in this context.
            prepareBeanFactory(beanFactory);

            try {
                // Allows post-processing of the bean factory in context subclasses.
                postProcessBeanFactory(beanFactory);

                // Invoke factory processors registered as beans in the context.
                invokeBeanFactoryPostProcessors(beanFactory);

                // Register bean processors that intercept bean creation.
                registerBeanPostProcessors(beanFactory);

                // Initialize message source for this context.
                initMessageSource();

                // Initialize event multicaster for this context.
                initApplicationEventMulticaster();

                // Initialize other special beans in specific context subclasses.
                onRefresh();

                // Check for listener beans and register them.
                registerListeners();

                // Instantiate all remaining (non-lazy-init) singletons.
                finishBeanFactoryInitialization(beanFactory);

                // Last step: publish corresponding event.
                finishRefresh();
            } catch (BeansException ex) {
                ...
                // Destroy already created singletons to avoid dangling resources.
                destroyBeans();

                // Reset 'active' flag.
                cancelRefresh(ex);

                // Propagate exception to caller.
                throw ex;
            } finally {
                // Reset common introspection caches in Spring's core, since we
                // might not ever need metadata for singleton beans anymore...
                resetCommonCaches();
            }
        }
    }
    ...
}
```

# beanFactory加载bean的流程(顺序)
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
   