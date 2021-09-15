---
layout: post
title: springBeanFactory流程解析
permalink: /springBeanFactory流程解析
date: 2021-09-13 10:22:28.000000000 +08:00
categories: [java,spring]
tags: [spring,源码]
---
# [spring启动流程]({{ "/springBoot容器启动流程" | relative_url }})中的refresh阶段
beanFactory在refresh阶段完成配置、扫描bean、注册bean等重要操作步骤  
* refresh代码流程  
```java
public abstract class AbstractApplicationContext extends DefaultResourceLoader implements ConfigurableApplicationContext {
    ...
    public void refresh() throws BeansException, IllegalStateException {
        synchronized (this.startupShutdownMonitor) {
            ...
            // 获取beanFactory,默认为new DefaultListableBeanFactory()
            ConfigurableListableBeanFactory beanFactory = obtainFreshBeanFactory();
            prepareBeanFactory(beanFactory);// 准备beanFactory

            try {
                postProcessBeanFactory(beanFactory);// 交给context去配置beanFactory

                invokeBeanFactoryPostProcessors(beanFactory);// 调用BeanFactoryPostProcessors

                registerBeanPostProcessors(beanFactory);// 优先初始化BeanPostProcessors

                initMessageSource();

                initApplicationEventMulticaster();// 初始化事件广播器，待会扫描以注解形式存在的listener

                onRefresh(); // context容器进行onRefresh，servletContext会在这个时候创建tomcat

                registerListeners();// 待会扫描以注解形式存在的listener

                finishBeanFactoryInitialization(beanFactory); // 加载LoadTimeWeaverAware(增加AOP，通过修改字节码实现AOP)，冻结配置，初始化所有的bean(单例、notLazy)

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

# beanFactory作用
如图![spring-beanFactory](/assets/images/posts/2021/spring-beanFactory.png)
## 1. BeanFactory
> 主要作用是通过名字或类型get对应的bean实例

getBean|isTypeMatch|
getBeanProvider|getType|getAliases等方法
   
## 2. SingletonBeanRegistry
> 主要作用是注册单例的bean  

registerSingleton|getSingleton|getSingletonNames等方法
   
## 3. HierarchicalBeanFactory
> 可分层的beanFactory主要作用是可以多个beanFactory并且有父子关系

getParentBeanFactory|containsLocalBean 只有两个方法
   
## 4. **BeanDefinitionRegistry**
> 注册bean的定义:BeanDefinition是包含了bean的所有信息，class名称、是否单例、isLazy、isPrimary、bean的依赖关系等  
> BeanDefinition包含了class的各种信息，但是不会初始化class，也就是说不会加载class到jvm中，主要通过ASM字节码读取器来解析class字节码的内容  
> ASM解析class字节码默认实现类```DefaultMethodsMetadataReader```  
> beanFactory通过调用BeanFactoryPostProcessor主要的实现[ConfigurationClassPostProcessor]({{ "/解析spring是如何向beanFactory注册bean的" | relative_url }})先扫描所有的class，通过AMS既可以读取class内容也不会加载class，然后符合条件的bean会包装成BeanDefinition注册到beanFactory中

registerBeanDefinition|removeBeanDefinition|
getBeanDefinition|getBeanDefinitionNames 等方法
   
## 5. AliasRegistry
> 为注册bean的别名，通过别名也可以获取到bean，主要作用就是注册bean的别名  

registerAlias|removeAlias|  
getAliases|isAlias 只有这四个方法
   
## 6. ListableBeanFactory
> 为获取一系列满足条件的bean，主要作用通过类型或注解获取对应的bean  

getBeansOfType|getBeanNamesForType|findAnnotationOnBean 等方法
   
## 7. **AutoWireCapableBeanFactory**
> 可自动装配的factory，在[获取Bean](#1-beanfactory)的时候，如果bean还没有初始化。则在初始化的时候会启自动装配  
> 默认实现```AbstractAutowireCapableBeanFactory#createBean```ioc和aop底层的装配都由它完成  

createBean|initializeBean|
applyBeanPostProcessorsBeforeInitialization|applyBeanPostProcessorsBeforeInitialization  
等其他方法

## 8. ConfigurableListableBeanFactory和ConfigurableBeanFactory  
> 生产bean时、装配时、类型转化时、销毁bean、冻结等配置各种各样的组件供方便使用

registerResolvableDependency|ignoreDependencyInterface|
registerScope|getRegisteredScope|  
freezeConfiguration|isConfigurationFrozen|  
preInstantiateSingletons|destroySingletons|
setTypeConverter|setConversionService等其他方法  

> **registerResolvableDependency(Class<?> dependencyType, @Nullable Object autowiredValue);**  
>   注册一个bean，其他依赖此类型的，可以直接用，autowiredValue不会放到bean工厂中，只会为其他类提供依赖  
> **ignoreDependencyInterface(Class<?> ifc);**  
>   自动装配时忽略ifc类型的接口，通常配合beanFactory的addBeanPostProcessor一起使用。当bean初始化完后，BeanPostProcessor专门处理忽略ifc类型的字段  
> **registerScope(String scopeName, Scope scope);**  
>   除单例和prototype之外有request、session等bean的生命周期定义都是由这个方法完成注册。通过Scope接口中的get方法获取bean
   
## 9. DefaultListableBeanFactory为以上接口的默认实现类

# beanFactory初始流程

## 1 获取beanFactory  
   context初始化时就自动创建好了。默认实现```org.springframework.beans.factory.support.DefaultListableBeanFactory```  
   ```this.beanFactory = new DefaultListableBeanFactory()```
   
## 2. 准备beanFactory  
   beanFactory是刚new出来，没有经过配置，prepareBeanFactory方法对beanFactory进行一些简单的配置
   如调用[registerResolvableDependency](#8-configurablelistablebeanfactory和configurablebeanfactory)注册BeanFactory、ApplicationContext等

## 3. 交给context实现类去配置beanFactory  
   例如：如果是servletBeanApplicationContext会对beanFactory增加额外的[Scope](#8-configurablelistablebeanfactory和configurablebeanfactory)，比如RequestScope、SessionScope等
   
## 4. 调用BeanFactoryPostProcessors
BeanFactoryPostProcessor：顾名思义，针对beanFactory初始化后的后置处理  
可能针对beanFactory注册一些其他的bean  
可能针对beanFactory移除一些bean  
BeanFactoryPostProcessor最重要的实现[ConfigurationClassPostProcessor，会扫描所有的bean]({{ "/解析spring是如何向beanFactory注册bean的" | relative_url }})  

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
   