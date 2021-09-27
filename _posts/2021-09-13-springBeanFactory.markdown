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
            prepareBeanFactory(beanFactory);// 配置beanFactory

            try {
                postProcessBeanFactory(beanFactory);// 交给context去配置beanFactory

                invokeBeanFactoryPostProcessors(beanFactory);// 调用BeanFactoryPostProcessors

                registerBeanPostProcessors(beanFactory);// 注册拦截bean创建的bean处理器

                initMessageSource();

                initApplicationEventMulticaster();// 初始化事件广播器，待会扫描以注解形式存在的listener

                onRefresh(); // context容器进行onRefresh，servletContext会在这个时候创建tomcat

                registerListeners();// 注册以注解形式存在的listener，并且广播之前已广播的事件

                finishBeanFactoryInitialization(beanFactory); // 加载LoadTimeWeaverAware(增加AOP，通过修改字节码实现AOP)，冻结配置，初始化所有的bean(单例、notLazy)

                /* 最后一步: 发布相对应的事件
                    1:获取所有Lifecycle类型的bean，如果是SmartLifecycle的类型并且isAutoStartup为true，则调用start方法
                    2:发布contextRefreshedEvent
                    3:把bean的信息注册到ManagementFactory（java监控工厂）
                 */
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

我们具体分析下refresh当中的重要操作步骤，分析之前，我们先了解beanFactory的作用以及实现都有哪些

# beanFactory作用
实现的类结构，如图![spring-beanFactory](/assets/images/posts/2021/spring-beanFactory.png)

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

registerBeanDefinition|removeBeanDefinition|
getBeanDefinition|getBeanDefinitionNames等方法  

**registerBeanDefinition**:BeanDefinition是包含了bean的所有信息，bean的名称、bean的class、scope、isLazy、isPrimary、bean的属性和bean的依赖关系等  
beanFactory获取一个bean时，除非bean已经存在，否则会通过beanDefinition自动创建，没有beanDefinition就会报错，所以beanDefinition是一个很重要的存在  
BeanDefinition包含了class的各种信息如注解的信息、class的资源路径等，但是不会初始化class，也就是说不会加载class到jvm中，主要通过ASM字节码读取器来解析class字节码的内容  
> ASM解析class字节码默认实现类`SimpleMetadataReaderFactory`，由`SharedMetadataReaderFactoryContextInitializer`在[spring启动阶段的](/springBoot容器启动流程)中的`context#initialize`注册  
> beanFactory通过调用[BeanFactoryPostProcessor](#4-调用beanfactorypostprocessors)主要的实现[ConfigurationClassPostProcessor](/解析spring是如何向beanFactory注册bean的)先扫描所有的class，通过AMS既可以读取class内容也不会加载class，然后符合条件的bean会包装成BeanDefinition注册到beanFactory中
   
## 5. AliasRegistry
> 为注册bean的别名，通过别名也可以获取到bean，主要作用就是注册bean的别名  

registerAlias|removeAlias|  
getAliases|isAlias 只有这四个方法
   
## 6. ListableBeanFactory
> 可列举的beanFactory，通过条件获取beans，主要作用通过类型或注解或其他条件获取对应的bean  

getBeansOfType|getBeanNamesForType|findAnnotationOnBean 等方法
   
## 7. **AutoWireCapableBeanFactory**
> 可自动装配的factory，在[获取Bean](#1-beanfactory)的时候，如果bean还没有创建则会[创建](/spring对bean实例化的流程#创建流程)  
> 默认实现```AbstractAutowireCapableBeanFactory#createBean```ioc、aop等逻辑都嵌套在内  

resolveDependency|resolveBeanByName|
applyBeanPostProcessorsBeforeInitialization|applyBeanPostProcessorsBeforeInitialization等其他方法  

**resolveDependency**  
  在自动装配的时候会通过此方法获取可被装配的值

## 8. ConfigurableListableBeanFactory和ConfigurableBeanFactory  
> 生产bean时、装配时、类型转化时、销毁bean、冻结等配置各种各样的组件供方便使用

registerResolvableDependency|ignoreDependencyInterface|
registerScope|getRegisteredScope|  
freezeConfiguration|isConfigurationFrozen|  
preInstantiateSingletons|destroySingletons|
setTypeConverter|setConversionService等其他方法  

**registerResolvableDependency(Class<?> dependencyType, @Nullable Object autowiredValue);**  
  注册一个bean，其他依赖此类型的，可以直接用，autowiredValue不会放到bean工厂中，只会为其他类提供依赖  
**ignoreDependencyInterface(Class<?> ifc);**  
自动装配时忽略ifc类型的接口，通常配合beanFactory的[addBeanPostProcessor](#5-注册拦截bean创建的bean处理器-beanpostprocessor)一起使用。当bean初始化完后，[BeanPostProcessor](#5-注册拦截bean创建的bean处理器-beanpostprocessor)专门处理ifc的字段  
如常用的如ServletContextAwareProcessor、EnvironmentAware、ApplicationContextAware等
**registerScope(String scopeName, Scope scope);**  
除单例和prototype之外有request、session等bean的生命周期定义都是由这个方法完成注册。通过Scope接口中的get方法获取bean

## 9. DefaultListableBeanFactory为以上接口的默认实现类

# beanFactory大体工作流程

## 1 获取beanFactory  
   context初始化时就自动创建好了  
   默认实现```org.springframework.beans.factory.support.DefaultListableBeanFactory```  
   ```this.beanFactory = new DefaultListableBeanFactory()```
   
## 2. 准备beanFactory  
   beanFactory是刚new出来，没有经过配置，prepareBeanFactory方法对beanFactory进行一些简单的配置  
   如注册[ApplicationContextAwareProcessor](#5-注册拦截bean创建的bean处理器-beanpostprocessor)，调用[registerResolvableDependency](#8-configurablelistablebeanfactory和configurablebeanfactory)注册BeanFactory、ApplicationContext等

## 3. 交给context实现类去配置beanFactory  
   例如：如果是servletBeanApplicationContext会对beanFactory增加额外的[Scope：registerScope](#8-configurablelistablebeanfactory和configurablebeanfactory)，比如RequestScope、SessionScope等

## 4. 调用BeanFactoryPostProcessors
> 针对beanFactory注册一些的bean、移除一些bean，等其他操作  
总之beanFactory不关心具体的实现，只调用后置处理器并把beanFactory作为参数传递过去即可

调用beanFactory的后置处理(beanFactory已经创建了)    
BeanFactoryPostProcessor：针对[ConfigurableListableBeanFactory](#8-configurablelistablebeanfactory和configurablebeanfactory)初始化后的后置处理  
BeanDefinitionRegistryPostProcessor：针对[BeanDefinitionRegistry](#4-beandefinitionregistry)初始化后的后置处理  
<font color='red'>BeanDefinitionRegistryPostProcessor是BeanFactoryPostProcessor的子类，会优先调用子类</font>

* 那BeanFactoryPostProcessor具体的实现都有哪些、以及调用顺序是什么呢
  * 具体的实现
    1. context有一个beanFactoryPostProcessors成员，在context初始化的时候可以往里面添加  
      <small>默认有LazyInitializationBeanFactoryPostProcessor:如果条件满足，则设置全部的bean为懒加载、PropertySourceOrderingPostProcessor:把defaultProperties配置文件的优先级降到最低，等</small>
    2. context持有beanFactory，在context初始化的时候会往beanFactory注册[BeanDefinition](#4-beandefinitionregistry)  
      <small>默认注册的有[ConfigurationClassPostProcessor，会扫描所有、注册符合条件的baan](/解析spring是如何向beanFactory注册bean的)等其他  
      具体可参考```AnnotationConfigUtils#registerAnnotationConfigProcessors```</small>
  * 调用的顺序
    1. context里面的beanFactoryPostProcessors成员，如果是```BeanDefinitionRegistryPostProcessor```类型，则优先调用，优先级是最高的
    2. 然后从beanFactory获取```BeanDefinitionRegistryPostProcessor```类型，优先调用实现了```PriorityOrdered```的接口
    3. 然后从beanFactory获取```BeanDefinitionRegistryPostProcessor```类型，调用实现了```Ordered```的接口
    4. 然后从beanFactory获取```BeanDefinitionRegistryPostProcessor```类型，经过[排序]({{ "/spring对Bean的排序" | relative_url }})之后、在调用没有调用过的。直到调用完beanFactory里面所有BeanDefinitionRegistryPostProcessor类型的bean为止
    5. 因为BeanDefinitionRegistryPostProcessor是BeanFactoryPostProcessor的子类，所以等调用完所有1,2,3,4步骤对应的BeanDefinitionRegistryPostProcessor之后接着调用1、2、3、4步骤中的BeanFactoryPostProcessor
    6. 调用context里面的beanFactoryPostProcessors成员且只是```BeanFactoryPostProcessor```的类型
    7. 然后从beanFactory获取```BeanFactoryPostProcessor```类型的所有BeanName，优先调用实现了```PriorityOrdered```的接口，在调用实现了```Ordered```的接口，最后未调用过的经[排序]({{ "/spring对Bean的排序" | relative_url }})之后在调用
  
## 5. 注册拦截bean创建的bean处理器-BeanPostProcessor
* BeanPostProcessor为最顶层的接口，共有5种类型不同作用的间接接口（包含自己）
  1. **InstantiationAwareBeanPostProcessor**  
     `postProcessBeforeInstantiation`: 可以拦截bean实例化之前（`不包含factoryBean#getObject`），如果返回不为空，则直接调用`BeanPostProcessor`的后置方法并直接返回，此时bean已创建完毕（很少用）  
     `postProcessAfterInstantiation`： 返回值为Boolean类型，如果返回为false则不允许自动装配（很少用）  
     `postProcessProperties`：<font color='red'>最重要的实现AutowiredAnnotationBeanPostProcessor实现自动装配</font>
     
  2. MergedBeanDefinitionPostProcessor(很少用)  
     `postProcessMergedBeanDefinition`: 如果第1步没有拦截实例化、则会通过[beanDefinition](#4-beandefinitionregistry)准备实例化，实例化之前可以拦截beanDefinition做一些修改  
     
  3. **BeanPostProcessor**  
     `postProcessBeforeInitialization`: bean实例化之后  
     `postProcessAfterInitialization`: bean自动装配且调用完初始化方法之后  
     如各种Aware的处理，以及@PostConstruct方法的调用等
     
  4. **SmartInstantiationAwareBeanPostProcessor**  
     `getEarlyBeanReference`: <font color='red'>提供早期的引用：如果是单例，并且是循环引用的情况下，最重要的实现InfrastructureAdvisorAutoProxyCreator实现事务aop拦截，且可以循环引用</font>  
     `predictBeanType`：Predict the type of the bean to be eventually returned from this（返回可以为null）  
     `determineCandidateConstructors`：Determine the candidate constructors to use for the given bean.(返回可以为null)

  5. DestructionAwareBeanPostProcessor  
    bean在销毁时会调用
    

* BeanPostProcessor注册顺序是什么呢？
  1. 从beanFactory获取```BeanPostProcessor```类型的所有beanNames  
  2. 遍历所有的beanNames，优先注册实现了```PriorityOrdered```的接口、然后在注册实现了```Ordered```的接口，最后未注册过的经[排序]({{ "/spring对Bean的排序" | relative_url }})之后在注册  
  3. 等所有的BeanPostProcessor注册完之后，如果是MergedBeanDefinitionPostProcessor类型的话注册顺序都会移到最后面哦  

## 6. 初始化国际化资源

## 7. 初始化事件广播器
不同于spring启动的listener，这个事件广播器用户是可以用来广播自定义事件并自定义监听的  
默认广播器的实现```SimpleApplicationEventMulticaster```  
> 使用时注入```ApplicationEventPublisher```bean，调用publishEvent方法,监听者需实现```ApplicationListener```接口即可使用

## 8. onRefresh初始化webServer
如果是servletContext，则会在此阶段初始化内嵌的tomcat,[并扫描所有的servlet、filter、其他servlet注册器等并关联到servletContext中](/springMvc执行流程#代码流程)

## 9. 获取并广播以注解形式存在的ApplicationListener
在[spring启动流程中]({{ "/springBoot容器启动流程" | relative_url }})通过spring-spi方式获取bean来事件广播，如果某些bean非spi配置的方式，而是以注解形式配置的，则广播不了  
所以在此阶段通过beanFactory获取以注解形式存在的listener，并把之前已广播的事件再次广播（伪事件，因为已经过了那个阶段了）

## 10. [实例化所有bean](/spring对bean实例化的流程)
实例化之前，优先实例化LoadTimeWeaverAware类型的bean(增加AOP，通过修改字节码实现AOP)  
* 实例化notLazyBean、singletonBean、如果为factoryBean，必须实现```SmartFactoryBean```接口且方法```isEagerInit```返回true才可以实例化  
> notLazy And singletons 的bean是从哪里来的呢？  
都是通过[BeanDefinitionRegistry](#4-beandefinitionregistry)注册的bean

* 实例化完之后如果是单例的bean并且实现了```SmartInitializingSingleton```接口，则会按照bean的注册顺序依次调用```afterSingletonsInstantiated```


## 11 收尾工作-发布相对应的事件
1:获取所有Lifecycle类型的bean，如果是SmartLifecycle的类型并且isAutoStartup为true，则调用start方法  
2:发布contextRefreshedEvent  
3:把bean的信息注册到ManagementFactory（java监控工厂）


<big>**至此beanFactory流程解析完成**</big>