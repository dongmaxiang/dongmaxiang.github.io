---
layout: post
title: springBoot容器启动流程
permalink: /springBoot容器启动流程
date: 2021-08-22 12:15:44.000000000 +08:00
categories: [java,spring]
tags: [spring,源码]
---


main方法启动时，springBoot启动流程的各个生命周期会以事件通知的方式，把事件告知其他程序。  
通过[spring-spi]({{ "/spring-spi" | relative_url }})获取所有需要监听事件的类。   
这个类为事件触发的主线类。大体流程为以下的几个方法。  
```java
public class EventPublishingRunListener implements SpringApplicationRunListener {
    ...
    private final SimpleApplicationEventMulticaster initialMulticaster = new SimpleApplicationEventMulticaster();

    public EventPublishingRunListener(SpringApplication application, String[] args) {
        // 通过springSPI获取所有的ApplicationListener，并copy到initialMulticaster
        for (ApplicationListener<?> listener : application.getListeners()) {
            this.initialMulticaster.addApplicationListener(listener);
        }
    }
    
    // 1
    @Override
    public void starting() {
        this.initialMulticaster.multicastEvent(new ApplicationStartingEvent(this.application, this.args));
    }
    // 2
    @Override
    public void environmentPrepared(ConfigurableEnvironment environment) {
        this.initialMulticaster
                .multicastEvent(new ApplicationEnvironmentPreparedEvent(this.application, this.args, environment));
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
    // 3
    @Override
    public void contextPrepared(ConfigurableApplicationContext context) {
        this.initialMulticaster
                .multicastEvent(new ApplicationContextInitializedEvent(this.application, this.args, context));
    }
    // 4
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
    // contextLoaded之后 会调用 context.refresh，会实例化所有的bean

    // 5
    @Override
    public void started(ConfigurableApplicationContext context) {
        context.publishEvent(new ApplicationStartedEvent(this.application, this.args, context));
        AvailabilityChangeEvent.publish(context, LivenessState.CORRECT);
    }

    // 6
    @Override
    public void running(ConfigurableApplicationContext context) {
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

2. environmentPrepared -》ApplicationEnvironmentPreparedEvent  
配置环境变量(远程)加载配置文件资源等---环境配置已就绪
> 环境加载配置之后，马上就要实例化ApplicationContext了，不同的WebApplicationType，applicationContext也不同
> 实例化完会调用ApplicationContextInitializer的initialize，事情通知容器已经实例化

3. contextPrepared -》ApplicationContextInitializedEvent    
容器准备---应用程序初始化完毕事件

4. contextLoaded -》ApplicationPreparedEvent  
容器已加载完毕---应用程序已准备就绪
> contextLoaded之后 会调用 context.refresh，会实例化所有的bean

5. started -》ApplicationStartedEvent  
过去式，代表容器开始运行已完成---应用程序已启动

6. running -》ApplicationReadyEvent  
运行中---程序已做完

--failed -》ApplicationFailedEvent  
容器或应用程序启动失败时的事件处理器，spring默认就是打印日志。  
我们可以实现此事件的监听，项目启动失败之后直接报警等


# 总结
ApplicationContext这个是spring的容器（非常重要），启动的流程基本上都是围绕着他展开。  
从各个事件的通知事件我们不难看出。从最开始的starting、environmentPrepared都是为applicationContext做准备。根据不同的WebType实例化不同的applicationContext，之后context会持久environment。  
然后再以context为中心进行initialize事件的触发、然后contextPrepared、contextLoaded、context.refresh。
最后在做结尾的工作started和running