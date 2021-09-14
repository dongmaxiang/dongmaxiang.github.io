---
layout: post
title: springBoot容器启动流程
permalink: /springBoot容器启动流程
date: 2021-08-22 12:15:44.000000000 +08:00
categories: [java,spring]
tags: [spring,源码]
---
main方法启动时，springBoot启动流程的各个生命周期会以事件通知的方式，把事件告知其他程序  
前期通过[spring-spi]({{ "/spring-spi" | relative_url }})获取所有监听事件的类   
* spring启动的大体流程为以下的几个方法  
```java
public class EventPublishingRunListener implements SpringApplicationRunListener {
    ...
    private final SimpleApplicationEventMulticaster initialMulticaster = new SimpleApplicationEventMulticaster();

    public EventPublishingRunListener(SpringApplication application, String[] args) {
        // 通过springSPI获取所有的ApplicationListener，并copy到initialMulticaster
        // 如果ApplicationListener是以注解形式使用，非spi配置的。会在[refresh阶段]({{ "/springBeanFactory流程解析" | relative_url }})扫描所有以注解形式配置的listener
        // 也就是说注解形式配置的listener，监听refresh之前的事件都是伪事件
        for (ApplicationListener<?> listener : application.getListeners()) {
            this.initialMulticaster.addApplicationListener(listener);
        }
    }
    
    // 1 开始
    @Override
    public void starting() {
        this.initialMulticaster.multicastEvent(new ApplicationStartingEvent(this.application, this.args));
    }
    
    // 2 环境准备
    @Override
    public void environmentPrepared(ConfigurableEnvironment environment) {
        this.initialMulticaster.multicastEvent(new ApplicationEnvironmentPreparedEvent(this.application, this.args, environment));
    }
    /**
     protected void applyInitializers(ConfigurableApplicationContext context) {
         for (ApplicationContextInitializer initializer : getInitializers()) {
             Class<?> requiredType = GenericTypeResolver.resolveTypeArgument(initializer.getClass(),
             ApplicationContextInitializer.class);
             Assert.isInstanceOf(requiredType, context, "Unable to call initializer.");
             initializer.initialize(context);
         }
     } 
     */

    // prepared之前 会调用 mian方法启动的SpringApplication 内置的 initialize,如上面的注释的代码
    // 3 上下文准备
    @Override
    public void contextPrepared(ConfigurableApplicationContext context) {
        this.initialMulticaster.multicastEvent(new ApplicationContextInitializedEvent(this.application, this.args, context));
    }
    
    // 4 上下文已加载
    @Override
    public void contextLoaded(ConfigurableApplicationContext context) {
        for (ApplicationListener<?> listener : this.application.getListeners()) {
            if (listener instanceof ApplicationContextAware) {
                ((ApplicationContextAware) listener).setApplicationContext(context);
            }
            context.addApplicationListener(listener);
        }
        this.initialMulticaster.multicastEvent(new ApplicationPreparedEvent(this.application, this.args, context));
    }
    // contextLoaded之后 会调用 [context.refresh]({{ "/springBeanFactory流程解析" | relative_url }})，会实例化所有的bean(单例的、notLazy的)，包括以注解形式配置的listener

    // 5 启动完成
    @Override
    public void started(ConfigurableApplicationContext context) {
        // 在refresh阶段后，后续的事件会通过context发出，context持有beanFactory,beanFactory在refresh期间会扫描所有的listener。所以就不能仅仅调用spi配置的listener了
        context.publishEvent(new ApplicationStartedEvent(this.application, this.args, context));
        AvailabilityChangeEvent.publish(context, LivenessState.CORRECT);
    }

    // 6 运行中
    @Override
    public void running(ConfigurableApplicationContext context) {
        // 通过context发出事件，context持有beanFactory,beanFactory会扫描所有的ApplicationListener。
        context.publishEvent(new ApplicationReadyEvent(this.application, this.args, context));
        AvailabilityChangeEvent.publish(context, ReadinessState.ACCEPTING_TRAFFIC);
    }

    @Override
    public void failed(ConfigurableApplicationContext context, Throwable exception) {
        ...
    }
    ...
}

```
> 当对象间存在一对多关系时，则使用观察者模式（Observer Pattern）。比如，当一个对象被修改时，则会自动通知依赖它的对象。观察者模式属于行为型模式。

# 启动流程

1. starting -》ApplicationStartingEvent  
正在进行时、代表容器刚开始运行了---发出程序开始事件  
springDevTools就是用到了此事件，把类加载器给换了一下，起到了热部署的作用，后期咱们会有详细的分析

2. environmentPrepared -》ApplicationEnvironmentPreparedEvent  
[配置环境变量加载配置文件资源等]({{ "/分析spring的Environment主要流程加载" | relative_url }})---发出环境配置已就绪事件  
nacos和springCloud远程加载配置文件就是用到了此事件，后期咱们会有详细的分析  
> 事件发出之后，马上就要实例化ApplicationContext了，不同的WebApplicationType，context不同   
> 不管什么样的context，都会持有beanFactory,并且都会向beanFactory注册一个非常重要的bean=[ConfigurationClassPostProcessor，扫描所有的bean]{{ "/解析spring是如何向beanFactory注册bean的" | relative_url }})  
> 实例化完后会发布事情通知容器已经实例化，调用ApplicationContextInitializer的initialize

3. contextPrepared -》ApplicationContextInitializedEvent    
容器准备---发出应用程序上下文初始化事件  
contextPrepared之后springBoot会把main方法所在的类注册到beanFactory中

4. contextLoaded -》ApplicationPreparedEvent  
容器已加载完毕---发出应用程序已准备就绪事件
> contextLoaded之后 会调用 context.refresh，会实例化所有的bean(单例的、notLazy的)  
> refresh阶段比较复杂，基本上都是操作beanFactory完成bean的扫描、组装、初始化等逻辑  
> beanFactory可参考[springBeanFactory流程解析]({{ "/springBeanFactory流程解析" | relative_url }})

5. started -》ApplicationStartedEvent  
发出应用程序已启动事件

6. running -》ApplicationReadyEvent  
运行中---发出程序已做完事件

--failed -》ApplicationFailedEvent  
启动失败时的事件处理器，spring默认就是打印日志。  
我们可以实现此事件的监听，项目启动失败之后直接报警等


# 总结
ApplicationContext这个是spring的容器（非常重要），启动的流程基本上都是围绕着他展开。  
从各个事件的通知事件我们不难看出。从最开始的starting、environmentPrepared都是为applicationContext做准备。根据不同的WebType实例化不同的applicationContext，之后context会持有environment  
environment包含了所有的配置文件  
然后再以context为中心进行initialize事件的触发、然后contextPrepared、contextLoaded、context.refresh  
refresh工作比较复杂也是beanFactory的核心，具体可参考[springBeanFactory流程解析]({{ "/springBeanFactory流程解析" | relative_url }})
最后在做结尾的工作started和running