---
layout: post
title: springBoot容器启动流程
permalink: /springBoot容器启动流程
date: 2021-08-22 12:15:44.000000000 +08:00
categories: [java,spring]
tags: [spring,源码]
---
main方法启动时，springBoot启动流程的各个生命周期会以事件通知的方式，把事件告知其他程序。
```java
public class EventPublishingRunListener implements SpringApplicationRunListener {
    ...
    @Override
    public void starting() {
        this.initialMulticaster.multicastEvent(new ApplicationStartingEvent(this.application, this.args));
    }
    @Override
    public void environmentPrepared(ConfigurableEnvironment environment) {
        this.initialMulticaster
                .multicastEvent(new ApplicationEnvironmentPreparedEvent(this.application, this.args, environment));
    }
    @Override
    public void contextPrepared(ConfigurableApplicationContext context) {
        this.initialMulticaster
                .multicastEvent(new ApplicationContextInitializedEvent(this.application, this.args, context));
    }
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

    @Override
    public void started(ConfigurableApplicationContext context) {
        context.publishEvent(new ApplicationStartedEvent(this.application, this.args, context));
        AvailabilityChangeEvent.publish(context, LivenessState.CORRECT);
    }

    @Override
    public void running(ConfigurableApplicationContext context) {
        context.publishEvent(new ApplicationReadyEvent(this.application, this.args, context));
        AvailabilityChangeEvent.publish(context, ReadinessState.ACCEPTING_TRAFFIC);
    }

    @Override
    public void failed(ConfigurableApplicationContext context, Throwable exception) {
        ApplicationFailedEvent event = new ApplicationFailedEvent(this.application, this.args, context, exception);
        if (context != null && context.isActive()) {
            // Listeners have been registered to the application context so we should
            // use it at this point if we can
            context.publishEvent(event);
        }
        else {
            // An inactive context may not have a multicaster so we use our multicaster to
            // call all of the context's listeners instead
            if (context instanceof AbstractApplicationContext) {
                for (ApplicationListener<?> listener : ((AbstractApplicationContext) context)
                        .getApplicationListeners()) {
                    this.initialMulticaster.addApplicationListener(listener);
                }
            }
            this.initialMulticaster.setErrorHandler(new LoggingErrorHandler());
            this.initialMulticaster.multicastEvent(event);
        }
    }
    ...
}

```
> 当对象间存在一对多关系时，则使用观察者模式（Observer Pattern）。比如，当一个对象被修改时，则会自动通知依赖它的对象。观察者模式属于行为型模式。

1.starting -》ApplicationStartingEvent  
正在进行时、代表容器刚开始运行了，发出程序开始事件

2.environmentPrepared -》ApplicationEnvironmentPreparedEvent  
配置环境变量(远程)加载配置文件资源等

3.contextPrepared -》ApplicationContextInitializedEvent
spring容器准备，

4.contextLoaded -》ApplicationPreparedEvent
spring容器已加载完毕，

5.started -》ApplicationStartedEvent

6.running -》ApplicationReadyEvent

--failed -》ApplicationFailedEvent  