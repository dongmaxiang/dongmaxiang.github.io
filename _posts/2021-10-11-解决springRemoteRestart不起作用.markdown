---
layout: post
title: 解决springRemoteRestart不起作用
permalink: /解决springRemoteRestart不起作用
date: 2021-10-10 17:43:40.000000000 +08:00
categories: [java,spring]
tags: [spring,热部署]
---

springDevTools提供了热部署的工具，按照网上的教程本地可以完美的支持热部署，但是一用到remoteRestart远程热部署就失效，热部署失败，抛ClassCastException异常    
为了解决这个问题，咱们今天分析一下他的原理，为什么本地修改的可以热部署，远程remoteRestart就会失效(热部署时为什么会报异常)  
技术栈：springBoot + MVC + DUBBO + NACOS + maven打包插件spring-boot-maven-plugin  


# 热部署原理分析
当我们修改class时，springDevTools利用了不同的classLoader重新加载class，并重新启动spring，使其生效  
优点就是已经加载过的class并不会重新加载以便节省性能，只针对动态修改的class重新加载即可
> 已加载的class无法在线卸载，只能用新的classLoader去加载，这样就起到了热部署的效果  
> 旧的classLoader以及对应加载过的class会被GC回收  

1. 在[springBoot启动的时候，监听启动时的事件](/springBoot容器启动流程)，然后用自己的热部署classLoader去重新启动spring（通过反射再次调用main）  
2. [自己classLoader并没有遵循双亲委派机制](/jvmClassLoader过程及原理)，而且优先用最新的class  
3. 最新的class是由spring实时监听class文件的变化，如果有修改则会上传到最新的class中，并让devTools重新启动spring    
   如果要达到热部署的目的，必须能把老的class卸载，所以必须是老的classLoader加载的这些类才行，这样当老的classLoader回收时所对应老的class也会一并销毁  
   如果采用双亲委派机制由JDK加载的话那就无法卸载
4. 在重新启动的过程中如果有最新的class就用，没有就遵循双亲委派去加载class，以此达到热部署的目的  

## classLoader只加载部分class的源码  
devTools的热部署classLoader只会加载部分的class，其余的class归JDK加载，那么他是如何只过滤部分的class呢？

```java
final class ChangeableUrls implements Iterable<URL> {
    ...
    private final List<URL> urls;
    
    // 该参数是JDK的classLoader对应的URLS(也就是所有的class路径)
    private ChangeableUrls(URL... urls) {
        DevToolsSettings settings = DevToolsSettings.get();
        List<URL> reloadableUrls = new ArrayList<>(urls.length);
        for (URL url : urls) {
            if ((settings.isRestartInclude(url) || isDirectoryUrl(url.toString())) && !settings.isRestartExclude(url)) {
                reloadableUrls.add(url);
            }
        }
        this.urls = Collections.unmodifiableList(reloadableUrls);
        ...
    }

    // 也就是说restart本地启动的时候(非remoteRestart)，只会加载自己项目的class，因为自己项目的class在Idea中就是以文件的方式存在
    private boolean isDirectoryUrl(String urlString) {
        return urlString.startsWith("file:") && urlString.endsWith("/");
    }
	...

    @Override
    public Iterator<URL> iterator() {
        return this.urls.iterator();
    }
}
```

---
---

# 解决远程热部署不生效的问题
我们已经知道了他的原理是用不同的classLoader去加载最新的class，只有老的classLoader加载的class才能卸载，这样新的class才会重新加载热部署才会生效  
根据网上的教程配置好remote远程热部署之后发现修改class上传部署启动时就会报ClassNotFondException或者会报ClassCastException

* ClassNotFondException   
  配置热部署检测文件改动的时间间隔就行  
  因为class编译后会重新覆盖，覆盖过程中会先把老的文件给删除，因为有时间差，所以spring误以为是删除而不是更新，这样导致重新启动的时候spring就找不到class了。  
  > 那为什么本地的就不会有这个问题，或者有这个问题之后不一会就好了呢？  
  因为remote是通过http协议传输新class的。在重新启动的过程中http会停止服务，一旦启动不起来就无法和cline交互了，也就永远起不来了  
  而本地没有通过http，它是在本地内存中直接执行热部署的代码逻辑，所以即使启动失败了也没关系，不一会他能检测到新文件的到来并且会触发事件重新启动，这样就不会报ClassNotFondException异常了  

  但是因为时间差的原因，还会有几率出现这样的问题，那么只能从源码中下手改代码了，或者用triggerFile实现更新也可以

* ClassCastException  
    原来是maven打包插件spring-boot-maven-plugin惹的祸，通过此插件会把我们的项目打包成jar包。[这样spring无法识别是file文件](#classloader只加载部分class的源码)，class就被JDK的classLoader加载了  
    当新的classLoader加载修改过的class时，由于没有采用双亲委派机制，导致父子classLoader都会加载这个class，但是会优先用子classLoader加载的class，导致class在连接的时候出现了ClassCastException异常
  
    > 解决办法是在devTools的classLoader加载class的时候，把我们的jar包给指定上就可以了，可以编写文件spring-devtools.properties把我们的jar包名配置上就行了  
    
    ```properties
    restart.include.selfProjectname=你的项目的jar包名称的正则表达式

    # 重启时dubbo会销毁，由于dubbo没有完全遵循spring重启的生命周期，在重启的时候静态变量导致dubbo重启异常，所以也要包含dubbo，重启的时候会把静态变量也给初始化
    restart.include.dubbo=.*dubbo.*

    # nacos也一样，由于nacos没有完全遵循spring重启的生命周期，在重启的时候静态变量导致重启失败
    restart.include.nacos-context=.*nacos-spring-context.*
    restart.include.nacos-autoconfigure=.*nacos-config-spring-boot-autoconfigure.*
    ```
  
---
---

# 优化热部署-减少部署时间

优先用[agent替换字节码的方式实现热部署](/java-agent#agent实现热更新)，秒级生效（如果不违反规范，且可以生效的话）  
如果失败，则还跟之前是有的方式一模一样，需要注意的是，如果需要重启则需要修改restart文件才会重启  
> 使用方式不变，跟springDevToolsRestart一模一样。具体不会的可百度，不一样的是服务端做了手脚，增加一层优化

```java
@Slf4j
@Configuration
@ConditionalOnClass(HttpRestartServer.class)
public class DevToolsReloadConfig {

    @Autowired
    ResourceLoader resourceLoader;

    @Bean
    public HttpRestartServer remoteRestartHttpRestartServer() {
        return new HttpRestartServer(getRestartServer(new DefaultSourceDirectoryUrlFilter()));
    }

    // 重写restartServer
    private RestartServer getRestartServer(SourceDirectoryUrlFilter sourceDirectoryUrlFilter) {
        return new RestartServer(sourceDirectoryUrlFilter) {
            final ClassLoaderFiles newFile = new ClassLoaderFiles();
            Set<String> waitingRestartFileNames = new HashSet<>();

            /**
             * 重载方法，接收新的class，优先用agent方式热更新，速度非常快
             */
            protected synchronized void restart(Set<URL> urls, ClassLoaderFiles newFiles) {
                for (ClassLoaderFiles.SourceDirectory sourceDirectory : newFiles.getSourceDirectories()) {
                    for (Map.Entry<String, ClassLoaderFile> fileEntry : sourceDirectory.getFilesEntrySet()) {
                        newFile.addFile(sourceDirectory.getName(), fileEntry.getKey(), fileEntry.getValue());
                        try {
                            if (fileEntry.getKey().endsWith(".class") && fileEntry.getValue().getKind() != ClassLoaderFile.Kind.DELETED) {
                                // 第三方开源的jar包，使当前的jvm能够获取到 JVMTI Instrumentation 实例
                                DynamicInstrumentationLoader.waitForInitialized();

                                String className = fileEntry.getKey()
                                        .replace("/", ".")
                                        .replace(".class", "");

                                Class<?> oldClass = ClassUtils.forName(className, resourceLoader.getClassLoader());

                                ClassDefinition classDefinition = new ClassDefinition(oldClass, fileEntry.getValue().getContents());
                                // 重新定义
                                InstrumentationSavingAgent.getInstrumentation().redefineClasses(classDefinition);
                                // 替换成功则移除，
                                waitingRestartFileNames.remove(fileEntry.getKey());
                                log.info("class reload:{}", fileEntry.getKey());
                                continue;
                            }
                        } catch (Throwable e) {
                            // 替换失败，只能通过热部署重启的方式啦。
                            log.info(fileEntry.getKey() + "reload failure，Modify the restart file for the restart to take effect:" + e.getClass().getName() + ":" + e.getMessage());
                        }
                        waitingRestartFileNames.add(fileEntry.getKey());

                    }
                }

                // 指定的restart文件有变动则重启，相当于restart中的triggerFile。
                if (waitingRestartFileNames.isEmpty() || !waitingRestartFileNames.contains("restart")) {
                    log.info("waitingRestartFileNames is empty or no restart file，waitingRestartFileNames:{}", waitingRestartFileNames);
                    return;
                }

                Restarter restarter = Restarter.getInstance();
                // 指定urls后restart类加载器会生效
                restarter.addUrls(urls);
                // 新的文件
                restarter.addClassLoaderFiles(newFile);

                // 记录本次更新的文件，如果启动失败，说明本次的更新文件有问题，用来删除并重新启动
                Set<String> persistentUpdatedFileNames = new HashSet<>(waitingRestartFileNames);
                
                waitingRestartFileNames = new HashSet<>();

                log.warn("spring restart new files:{}", persistentUpdatedFileNames);
                restarter.restart(failure -> {
                    if (persistentUpdatedFileNames.isEmpty()) {
                        // 本次修改的文件为空，说明跟修改的文件没有关系，属于正常的启动失败
                        return FailureHandler.Outcome.ABORT;
                    }
                    
                    // 如果启动失败，则删除本次更新的文件，保证能正常启动，不然服务挂了，别让你这个热部署的插件 造成不好的影响
                    try {
                        // 由于是final只能通过反射来移除新增的class文件了
                        ClassLoaderFiles classLoaderFiles = (ClassLoaderFiles) FieldUtils.readDeclaredField(restarter, "classLoaderFiles", true);
                        
                        @SuppressWarnings("unchecked")
                        Map<String, ClassLoaderFiles.SourceDirectory> sourceDirectories = (Map<String, ClassLoaderFiles.SourceDirectory>) FieldUtils.readDeclaredField(classLoaderFiles, "sourceDirectories", true);
                        
                        for (Map.Entry<String, ClassLoaderFiles.SourceDirectory> directoryEntry : sourceDirectories.entrySet()) {
                            
                            @SuppressWarnings("unchecked")
                            Map<String, ClassLoaderFile> files = (Map<String, ClassLoaderFile>) FieldUtils.readDeclaredField(directoryEntry.getValue(), "files", true);
                            
                            for (String name : persistentUpdatedFileNames) {
                                files.remove(name);
                            }
                        }

                        log.warn("retry failure，Try to delete the new file and restart:{}", persistentUpdatedFileNames);
                        // 清空
                        persistentUpdatedFileNames.clear();
                        // 重新启动
                        return FailureHandler.Outcome.RETRY;
                    } catch (IllegalAccessException e) {
                        throw new RuntimeException(e);
                    }
                });
            }
        };
    }

}
```