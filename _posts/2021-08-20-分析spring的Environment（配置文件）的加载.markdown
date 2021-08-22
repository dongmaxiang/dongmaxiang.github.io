---
layout: post
title: 分析spring的Environment（配置文件）的加载
permalink: /分析spring的Environment主要流程加载
date: 2021-08-20 15:53:57.000000000 +08:00
categories: [java,spring]
tags: [spring,源码]
---

项目立项->开发->测试->维护->上线->维护，这几个过程中分为不同的环境。不同的环境不同业务有着不同的逻辑。  
spring完美支持启动的时候加载不同的配置文件。我们通过指定不同的spring.profiles.active即可实现加载不同的配置文件。  
不管怎么样默认会加载如下几个配置文件   
```java
public class ConfigFileApplicationListener implements EnvironmentPostProcessor, SmartApplicationListener, Ordered {
    ...
    // Note the order is from least to most specific (last one wins)
    private static final String DEFAULT_SEARCH_LOCATIONS = "classpath:/,classpath:/config/,file:./,file:./config/*/,file:./config/";

    private static final String DEFAULT_NAMES = "application";
    ...
}
public class PropertiesPropertySourceLoader implements PropertySourceLoader {
    ...
    @Override
    public String[] getFileExtensions() {
        return new String[]{"properties", "xml"};
    }
    ...
}
public class YamlPropertySourceLoader implements PropertySourceLoader {

    @Override
    public String[] getFileExtensions() {
        return new String[]{"yml", "yaml"};
    }
}
```
5个位置，一个名称，4个后缀，总共有多少种组合？（还没有profile情况下😁）

# 加载流程
[springBoot容器启动流程]({{ "/springBoot容器启动流程" | relative_url }})

## springListener
spring factories 配置了容器启动的监听类  
```properties
# Application Listeners
org.springframework.context.ApplicationListener=\
...
org.springframework.boot.context.config.ConfigFileApplicationListener,\
...
```

此监听类又独自搞了一套EnvironmentPostProcessor，同样也是用的spring spi机制来处理
```java
public class ConfigFileApplicationListener implements EnvironmentPostProcessor, SmartApplicationListener, Ordered {

    /**
     * The default order for the processor.
     */
    public static final int DEFAULT_ORDER = Ordered.HIGHEST_PRECEDENCE + 10;
    ...

    // 监听spring boot容器的事件
    public void onApplicationEvent(ApplicationEvent event) {
        if (event instanceof ApplicationEnvironmentPreparedEvent) {
            // 调用 独自搞的EnvironmentPostProcessor
            onApplicationEnvironmentPreparedEvent((ApplicationEnvironmentPreparedEvent) event);
        }
        if (event instanceof ApplicationPreparedEvent) {
            onApplicationPreparedEvent(event);
        }
    }
    
    private void onApplicationEnvironmentPreparedEvent(ApplicationEnvironmentPreparedEvent event) {
        // 根据spring spi 找出environment处理类
        List<EnvironmentPostProcessor> postProcessors = SpringFactoriesLoader.loadFactories(EnvironmentPostProcessor.class, getClass().getClassLoader());
        // 添加self
        postProcessors.add(this);
        // 排序如果有比DEFAULT_ORDER优先级高的那么会优先处理。
        AnnotationAwareOrderComparator.sort(postProcessors);
        for (EnvironmentPostProcessor postProcessor : postProcessors) {
            // 进行处理
            postProcessor.postProcessEnvironment(event.getEnvironment(), event.getSpringApplication());
        }
    }

    // self postProcessEnvironment
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        RandomValuePropertySource.addToEnvironment(environment);
        new Loader(environment, application.getResourceLoader()).load();
    }
    ...
}
```


## 真正加载的逻辑

```java
private class Loader {

    private final ConfigurableEnvironment environment;

    private final PropertySourcesPlaceholdersResolver placeholdersResolver;

    private final ResourceLoader resourceLoader;

    private final List<PropertySourceLoader> propertySourceLoaders;

    private Deque<Profile> profiles;

    private List<Profile> processedProfiles;

    private boolean activatedProfiles;

    private Map<Profile, MutablePropertySources> loaded;

    private Map<DocumentsCacheKey, List<Document>> loadDocumentsCache = new HashMap<>();

    Loader(ConfigurableEnvironment environment, ResourceLoader resourceLoader) {
        this.environment = environment;
        this.placeholdersResolver = new PropertySourcesPlaceholdersResolver(this.environment);
        this.resourceLoader = (resourceLoader != null) ? resourceLoader : new DefaultResourceLoader(null);
        this.propertySourceLoaders = SpringFactoriesLoader.loadFactories(PropertySourceLoader.class,
                getClass().getClassLoader());
    }

    void load() {
        // 排除 defaultProperties资源里面的spring.profiles.active|include属性
        FilteredPropertySource.apply(this.environment, DEFAULT_PROPERTIES, LOAD_FILTERED_PROPERTY,
                (defaultProperties) -> {
                    this.profiles = new LinkedList<>();
                    this.processedProfiles = new LinkedList<>();
                    this.activatedProfiles = false;
                    this.loaded = new LinkedHashMap<>();
                    // 初始化profile,非命令行传递的active的参数，profiles会有两个，一个是null，一个是default
                    // 意思是直接搜索application名字的资源，以及application-default的资源（如果命令行参数指定了active则不会有default）
                    initializeProfiles();
                    // 循环加载不同的profile
                    while (!this.profiles.isEmpty()) {
                        Profile profile = this.profiles.poll();
                        if (isDefaultProfile(profile)) {
                            addProfileToEnvironment(profile.getName());
                        }
                        // 配合5个位置，1个名称，4个后缀，加载不同的profile。
                        // 加载当前的profile，如果遇到新的spring.profiles.active|include属性，则会再次添加到profiles里，继续while循环加载
                        load(profile, this::getPositiveProfileFilter,
                                addToLoaded(MutablePropertySources::addLast, false));
                        /* 
                         * this::getPositiveProfileFilter：
                         * yml配置文件 支持 '---' 用来分隔配置，此方法就是用来判断是否可以加载分隔的内容
                         * 如果分割的内容中有spring.profiles，但是spring还未加载过的话，spring是不支持加载此内容的
                         * 具体可移步org.springframework.boot.context.config.ConfigFileApplicationListener.Loader#asDocuments
                         */
                        
                        /*
                         * addToLoaded(MutablePropertySources::addLast, false)
                         * 顾名思义，把profile找到的source无条件的加载到这个字段里：Map<Profile, MutablePropertySources> loaded;
                         */
                        
                        this.processedProfiles.add(profile);
                    }
                    // yml配置文件 支持 '---' 用来分隔配置，此方法就是优先加载 (5个位置，1个名称，4个后缀)的文件里面的分隔内容
                    load(null, this::getNegativeProfileFilter, addToLoaded(MutablePropertySources::addFirst, true));
                    // 把加载的资源配置到spring的environment里面
                    addLoadedPropertySources();
                    // environment.setActiveProfiles
                    applyActiveProfiles(defaultProperties);
                });
    }
}
```
至此代码分析完毕，如果想看更细节的东西，请移步至org.springframework.boot.context.config.ConfigFileApplicationListener.Loader#load()

## 总结
通过监听springEnvironment事件，然后用spring SPI找出所有的EnvironmentPostProcessor  
Load类为加载配置文件的类。它的逻辑主要分为  
1.初始化profile(包含null,以及未指定命令行参数的active时用defaultProfile)  
2.循环profile加载（5个位置、1个名称、4个后缀）的文件  
3.把加载的资源配置到spring的environment里面  
4.setActiveProfiles