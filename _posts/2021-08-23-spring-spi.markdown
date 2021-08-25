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

springBoot main启动时就用到了  
```java
public SpringApplication(ResourceLoader resourceLoader, Class<?>... primarySources) {
    ...
    // Context initialize 监听器
    setInitializers((Collection) getSpringFactoriesInstances(ApplicationContextInitializer.class));
    // 所有的ApplicationListener
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
    // 排序
    AnnotationAwareOrderComparator.sort(instances);
    return instances;
}

```

# 原理
在所有的classPath中寻找资源为```META-INF/spring.factories```的文件。  
里面的格式为key=value[,value,value]
> key为class全类名，value为对应实现类的全类名

通过SpringFactoriesLoader 加载文件的内容。使用时通过```SpringFactoriesLoader.loadFactoryNames(type, classLoader)```来获取对应的value，然后在通过反射实例化

# 源码赏析
```java
public final class SpringFactoriesLoader {

	public static final String FACTORIES_RESOURCE_LOCATION = "META-INF/spring.factories";

	...

	public static List<String> loadFactoryNames(Class<?> factoryType, @Nullable ClassLoader classLoader) {
		String factoryTypeName = factoryType.getName();
		return loadSpringFactories(classLoader).getOrDefault(factoryTypeName, Collections.emptyList());
	}

	private static Map<String, List<String>> loadSpringFactories(@Nullable ClassLoader classLoader) {
		MultiValueMap<String, String> result = cache.get(classLoader);
		if (result != null) {
			return result;
		}

		// 通过classLoader获取所有的资源，并加载本地缓存里面
		try {
			Enumeration<URL> urls = (classLoader != null ?
					classLoader.getResources(FACTORIES_RESOURCE_LOCATION) :
					ClassLoader.getSystemResources(FACTORIES_RESOURCE_LOCATION));
			result = new LinkedMultiValueMap<>();
			while (urls.hasMoreElements()) {
				URL url = urls.nextElement();
				UrlResource resource = new UrlResource(url);
				Properties properties = PropertiesLoaderUtils.loadProperties(resource);
				for (Map.Entry<?, ?> entry : properties.entrySet()) {
					String factoryTypeName = ((String) entry.getKey()).trim();
					for (String factoryImplementationName : StringUtils.commaDelimitedListToStringArray((String) entry.getValue())) {
						result.add(factoryTypeName, factoryImplementationName.trim());
					}
				}
			}
			cache.put(classLoader, result);
			return result;
		}
		catch (IOException ex) {
			throw new IllegalArgumentException("Unable to load factories from location [" +
					FACTORIES_RESOURCE_LOCATION + "]", ex);
		}
	}
}

```