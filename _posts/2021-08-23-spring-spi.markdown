---
layout: post
title: spring-spi
permalink: /spring-spi
date: 2021-08-23 17:41:55.000000000 +08:00
categories: [java,spring]
tags: [spring,源码]
---

java有[java的spi]({{ "/java-spi.html" | relative_url }})  
dubbo有[dubbo的spi]({{ "/dubbo-spi.html" | relative_url }})  
spring也有自己的spi  

spring spi 入口类为```org.springframework.core.io.support.SpringFactoriesLoader```

spring main启动时就用到了
```java

	public SpringApplication(ResourceLoader resourceLoader, Class<?>... primarySources) {
		...
        // set初始化的监听器
		setInitializers((Collection) getSpringFactoriesInstances(ApplicationContextInitializer.class));
        // set所有的监听器
		setListeners((Collection) getSpringFactoriesInstances(ApplicationListener.class));
		...
	}
	
    private <T> Collection<T> getSpringFactoriesInstances(Class<T> type) {
        return getSpringFactoriesInstances(type, new Class<?>[] {});
    }

    private <T> Collection<T> getSpringFactoriesInstances(Class<T> type, Class<?>[] parameterTypes, Object... args) {
        ClassLoader classLoader = getClassLoader();
        // SpringFactoriesLoader为spring spi
        Set<String> names = new LinkedHashSet<>(SpringFactoriesLoader.loadFactoryNames(type, classLoader));
        List<T> instances = createSpringFactoriesInstances(type, parameterTypes, classLoader, args, names);
        AnnotationAwareOrderComparator.sort(instances);
        return instances;
    }
```

