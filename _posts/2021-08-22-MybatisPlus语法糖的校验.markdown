---
layout: post
title: MybatisPlus语法糖的校验
permalink: /MybatisPlus语法糖的校验
date: 2021-08-22 17:43:20.000000000 +08:00
categories: [java,设计模式]
tags: [代码规范,mybatisPlus]
---

我们规定建立一层Manger，用来管理sql的一层。去除xml里面的sql。因为写sql后期不易维护。  
如果想要使用MybatisPlus则必须[继承此BaseManager]({{ "/重新加装MybatisPlus#5避免空指针使api操作更安全" | relative_url }})。    
> 一个表对应一个实体、一个mapper，一个manager  
> 实体有公共的BaseDomain,mapper有公共CustomBaseMapper,manager有公共的BaseManager  
> 我们通过代码依赖校验保证都能正确的继承以上的公共类

**如何有效(强制)的避免以下相同拼接的sql出现在多处？**  
例如以下的sql拼接语法糖  

```java
public DemoService {
    
    @Autowired
    DemoManager demoManager;
    
    public void doSomeA() {
        ...
        List<Object> list = this.demoManager.lambdaQuery()
            .eq("Demo.field1", 1)
            .eq("Demo.field2", 3)
            .like("Demo.field3", "like")
            .list();
        // 其他业务逻辑
        ...
    }
    
    public void doSomeB() {
            ...
            List<Object> list = this.demoManager.lambdaQuery()
                .eq("Demo.field1", 1)
                .eq("Demo.field2", 3)
                .like("Demo.field3", "like")
                .list();
            // 其他业务逻辑
            ...
    }
}
```

mybatisPlus用语法糖通过.点.点.即可完成sql的拼接。优点是显而易见的，但同样的避免不了缺点的产生。  
虽然能快速满足咱们的业务是需求，但是对于后期维护人员来说是个不可磨灭的灾难，因为他不好定位到底都是哪里有这样的逻辑。  
虽然我们可以定制规范来约束大家把.点.点.的sql拼接的语法封装成一个方法。但是在人员越来越多的情况下，没有强制的规范约束会变得越来越乱。

那如何强制约束呢？  
1. 通过编写maven的编译插件，检测代码是否有冗余的，或者sql拼接出现在非manager层中直接编译不通过，予以警告。但是由于学习成本比较大，编译平台过多，就放弃了(有心者可以按照此方法来实现，欢迎交流探讨)。  
2. 通过Java的调用栈来判断是谁在调用(本文的实现)

原理  
通过看源码，语法糖拼接sql之前必定会```new  com.baomidou.mybatisplus.core.conditions.Wrapper```该类是语法糖对象顶层的超类(abstract class)。  
通过切入wrapper的构造方法，判断是谁new的，如果调用者是别的模块，比如在service中new的Wrapper，则直接报异常。提示语法糖不符合规范即可完成强制校验。  
我们用javassist工具修改mybatisPlusJar包中的源码  

## 上代码
spring factories 配置容器启动的监听类
```properties
org.springframework.context.ApplicationListener=com.ManagerVerify
```
factories可参考[springBoot容器启动流程]({{ "/springBoot容器启动流程" | relative_url }})

ENV可参考 [获取spring启动环境的工具类]({{ "/获取spring启动环境的工具类" | relative_url }})
```java
@Slf4j
public static class ManagerVerify implements ApplicationListener<ApplicationPreparedEvent> {

    @SneakyThrows
    @Override
    public void onApplicationEvent(ApplicationPreparedEvent event) {

        log.info("begin Weaving for runtime check");
        // test环境肯定都是按照规范来的,正式环境不做切入。提高性能。
        if (ENV.isProd()) {
            log.info("Non-dev does not check");
            return;
        }

        // wrapper超类实现的接口的classLoader
        // 有用到restartDevTools或者spring-boot-maven-plugins，classLoader都会不同，用超类的classLoader准没错
        ClassLoader loader = ISqlSegment.class.getClassLoader();
        log.info("begin Weaving into  manager for verify caller ，verify package name :{} ,classLoader:{}", com.wuyi.mkt.common.constant.Constant.CURRENT_MANAGER_PACKAGE, loader);
        ClassPool pool = ClassPool.getDefault();
        pool.insertClassPath(new LoaderClassPath(loader));
        CtClass wrapper = pool.get("com.baomidou.mybatisplus.core.conditions.Wrapper");
        // 如果已经toClass，则是冻结的状态，spring多容器下此方法肯定会多次调用
        if (wrapper.isFrozen()) {
            log.info("isFrozen");
            return;
        }

        {
            // 调用栈字符串拼接，用来做错误提示
            StringBuilder sb = new StringBuilder();
            // 整个的调用栈
            StackTraceElement[] ste = (new Throwable()).getStackTrace();
            // manager层的调用次数
            int managerCount = 0;
            for (int i = 0; i < ste.length; ++i) {
                StackTraceElement s = ste[i];
                // 这个是mybatisPlus源码中new的，如果是此类，我们不做校验
                if (s.getClassName().contains("com.baomidou.mybatisplus.core.toolkit.Wrappers$EmptyWrapper")){
                    return;
                }
                String className = s.getClassName();
                sb.append(className).append(":").append(s.getMethodName()).append(":").append(s.getLineNumber()).append("\\\\n");
                // s.getLineNumber() > 0: 忽略动态代理的调用栈，动态代理的lineNumber = -1
                if (className.startsWith("你的项目的manager层的包名") && !className.contains("BaseManager") && s.getLineNumber() > 0){
                    managerCount++;
                }
            }
            // 如果没有manager层调用，而是其他层调用，则直接报错，起到了强制校验的功能
            if (managerCount == 0) {
                // 提示并携带stacktrace
                throw new RuntimeException("请把sql拼接的条件写在manager中\n" + sb);
            }
        }
        wrapper.getConstructors()[0].insertBeforeBody("需要把上面括号中的代码粘贴到此处，为了读者阅读方便就给提到了上面。");
        // 加载class，一但加载之后本工具类，不能再次修改
        wrapper.toClass(loader, null);
        log.info("weaving succeed");
    }
}
```

# 总结
配置好容器启动监听之后，赶在语法糖超类加载之前，利用javassist修改字节码工具。修改语法糖超类的构造方法。  
构造方法执行的时候代表要开始语法糖拼接了。我们通过(new Throwable)查看java的stackTrace调用栈，如果没有我们的manager层调用的话，直接抛出异常，这样就起到了强制校验的功能了。