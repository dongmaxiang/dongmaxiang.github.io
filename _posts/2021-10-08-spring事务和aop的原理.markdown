---
layout: post
title: spring事务和aop的原理
permalink: /spring事务和aop的原理
date: 2021-10-08 15:41:10.000000000 +08:00
categories: [java,spring]
tags: [spring,事务]
---

# AOP

springAop大体分为两种技术方式，一种是基于动态代理的，一种是基于字节码增强的  

* 动态代理的有基于
  1. jdk的
  2. 基于CGLIB的
  
* 字节码增强的有
  1. 在编译时做增强的
  2. class加载的时候做增强的
  
```java
public enum AdviceMode {

	/**
	 * JDK proxy-based advice.
	 */
	PROXY,

	/**
	 * AspectJ weaving-based advice.
	 */
	ASPECTJ

}
```


## 基于动态代理-PROXY 

`AbstractAutoProxyCreator`它是个抽象类，并且是[bean的后置处理器，在bean创建的时候拦截，并寻找合适的切入点返回对应的proxy](/beanPostProcessor的调用流程及各种实现#7-postprocessafterinitialization)    
其中有3个实现类  

1. InfrastructureAdvisorAutoProxyCreator  
   如果只是开启事务则会用到此实现  
   AOP生效规则：bean必须是`Advisor`类型，且role为`BeanDefinition.ROLE_INFRASTRUCTURE`才会生效  
  
2. AspectJAwareAdvisorAutoProxyCreator  
  基础xml配置方式`<aop:config>...</aop:config>`  
  AOP生效规则：只要是`Advisor`类型的bean就会生效，不关心role
  
  
3. AnnotationAwareAspectJAutoProxyCreator  
  继承上面那个类  
  AOP生效规则：同上且支持注解表达式`@Aspect`

> 优先级从上到下，只要注册了优先级比较高的class，低优先级的会自动失效

不论是事务`@EnableTransactionManagement`，还是缓存`@EnableCaching`，或者自定义的AOP`@EnableAspectJAutoProxy`，只会往beanFactory注册一个`AbstractAutoProxyCreator`类型的bean  
beanName为`org.springframework.aop.config.internalAutoProxyCreator`

```java
public abstract class AopConfigUtils {

  /**
   * The bean name of the internally managed auto-proxy creator.
   */
  public static final String AUTO_PROXY_CREATOR_BEAN_NAME =
          "org.springframework.aop.config.internalAutoProxyCreator";

  /**
   * Stores the auto proxy creator classes in escalation order.
   */
  private static final List<Class<?>> APC_PRIORITY_LIST = new ArrayList<>(3);

  static {
    // Set up the escalation list...
    APC_PRIORITY_LIST.add(InfrastructureAdvisorAutoProxyCreator.class);
    APC_PRIORITY_LIST.add(AspectJAwareAdvisorAutoProxyCreator.class);
    APC_PRIORITY_LIST.add(AnnotationAwareAspectJAutoProxyCreator.class);
  }
  ...

  // 代理class
  public static void forceAutoProxyCreatorToUseClassProxying(BeanDefinitionRegistry registry) {
    if (registry.containsBeanDefinition(AUTO_PROXY_CREATOR_BEAN_NAME)) {
      BeanDefinition definition = registry.getBeanDefinition(AUTO_PROXY_CREATOR_BEAN_NAME);
      definition.getPropertyValues().add("proxyTargetClass", Boolean.TRUE);
    }
  }

  // 暴露proxy
  public static void forceAutoProxyCreatorToExposeProxy(BeanDefinitionRegistry registry) {
    if (registry.containsBeanDefinition(AUTO_PROXY_CREATOR_BEAN_NAME)) {
      BeanDefinition definition = registry.getBeanDefinition(AUTO_PROXY_CREATOR_BEAN_NAME);
      definition.getPropertyValues().add("exposeProxy", Boolean.TRUE);
    }
  }

  // 往beanFactory注册拦截bean初始化的beanPostProcessor
  private static BeanDefinition registerOrEscalateApcAsRequired(Class<?> cls, BeanDefinitionRegistry registry, @Nullable Object source) {
      
    Assert.notNull(registry, "BeanDefinitionRegistry must not be null");

    // 如果已经注册过则不会重新注册
    if (registry.containsBeanDefinition(AUTO_PROXY_CREATOR_BEAN_NAME)) {
      BeanDefinition apcDefinition = registry.getBeanDefinition(AUTO_PROXY_CREATOR_BEAN_NAME);
      if (!cls.getName().equals(apcDefinition.getBeanClassName())) {
        int currentPriority = findPriorityForClass(apcDefinition.getBeanClassName());
        int requiredPriority = findPriorityForClass(cls);
        if (currentPriority < requiredPriority) {
          apcDefinition.setBeanClassName(cls.getName());
        }
      }
      return null;
    }

    RootBeanDefinition beanDefinition = new RootBeanDefinition(cls);
    beanDefinition.setSource(source);
    beanDefinition.getPropertyValues().add("order", Ordered.HIGHEST_PRECEDENCE);
    beanDefinition.setRole(BeanDefinition.ROLE_INFRASTRUCTURE);
    registry.registerBeanDefinition(AUTO_PROXY_CREATOR_BEAN_NAME, beanDefinition);
    return beanDefinition;
  }
}
```

* 注册完之后会在bean实例化的拦截，寻找能够切入的点，返回对应的proxy
```java
public abstract class AbstractAutoProxyCreator extends ProxyProcessorSupport implements SmartInstantiationAwareBeanPostProcessor, BeanFactoryAware {
    @Override
    public Object postProcessAfterInitialization(@Nullable Object bean, String beanName) {
        if (bean != null) {
            Object cacheKey = getCacheKey(bean.getClass(), beanName);
            // 如果没有提供过早期的引用(循环引用)，则可以进行proxy（早期的引用已经proxy了）
            if (this.earlyProxyReferences.remove(cacheKey) != bean) {
                return wrapIfNecessary(bean, beanName, cacheKey);
            }
        }
        return bean;
    }
    
    protected Object wrapIfNecessary(Object bean, String beanName, Object cacheKey) {
		if (StringUtils.hasLength(beanName) && this.targetSourcedBeans.contains(beanName)) {
			return bean;
		}
		if (Boolean.FALSE.equals(this.advisedBeans.get(cacheKey))) {
			return bean;
		}
		//  过滤掉不必代理的类，
        //  如果是这些接口的实现Advice、Pointcut、Advisor、AopInfrastructureBean，则不会代理
		if (isInfrastructureClass(bean.getClass()) || shouldSkip(bean.getClass(), beanName)) {
			this.advisedBeans.put(cacheKey, Boolean.FALSE);
			return bean;
		}

		// 根据当前的class寻找对应的AOP
		Object[] specificInterceptors = getAdvicesAndAdvisorsForBean(bean.getClass(), beanName, null);
		if (specificInterceptors != DO_NOT_PROXY) {
			this.advisedBeans.put(cacheKey, Boolean.TRUE);
			// 创建代理
			Object proxy = createProxy(bean.getClass(), beanName, specificInterceptors, new SingletonTargetSource(bean));
			this.proxyTypes.put(cacheKey, proxy.getClass());
			return proxy;
		}

		this.advisedBeans.put(cacheKey, Boolean.FALSE);
		return bean;
	}
	...
}
```

---

## 基于字节码增强技术-ASPECTJ

不同于proxy，字节码增加运行效率是比较快的，因为相当于我们手写的代码，且没有这么复杂的动态代理逻辑。更不会出现内嵌方法调用时aop不生效的情况  
> 但这种技术为什么没有流行起来呢？？？

1. 基于agent可在class加载的时候进行动态的替换字节码  
   事务`@EnableTransactionManagement`、缓存`@EnableCaching`、异步`@EnableAsync`等，如果注解中的配置为`AdviceMode=ASPECTJ`，则会以字节码切入实现AOP  
   前提是在class加载之前，能够获取到`Instrumentation`的实例，不然无法实现AOP
  

2. 基于编译阶段做切入操作  
  [具体可google搜索class编译时做字节码切入](https://leon-wtf.github.io/springboot/2019/12/30/spring-aop-vs-aspectj/)


---
---

# 事务的原理
springBoot: `@EnableTransactionManagement`  
spring.xml: `<tx:annotation-driven/>`  
以上配置表明`@Transactional`注解即可生效，那么他的原理是什么呢？  

* xml原理  
  `AnnotationDrivenBeanDefinitionParser#parse`

* 注解原理  
  `TransactionManagementConfigurationSelector#selectImports`  

## 基于PROXY  

## 基于字节码增强  
两种使用大同小异，底层原理都是注册一个aop`Advisor`，判断有@Transaction注解的就会自动动态代理  
在方法调用的时候，aop拦截方法并执行`TransactionAspectSupport#invokeWithinTransaction`，根据`@Transaction`的配置进行开始事务、隔离配置、回滚等操作


---
---

# 设置事务对所有的异常进行回滚

默认为RuntimeException和Error的类型才会事务回滚  
```java

public class DefaultTransactionAttribute extends DefaultTransactionDefinition implements TransactionAttribute {
    ...
    @Override
    public boolean rollbackOn(Throwable ex) {
        return (ex instanceof RuntimeException || ex instanceof Error);
    }
    ...
}
```

通过分析事务的核心代码`TransactionAspectSupport#invokeWithinTransaction`(开启、回退、隔离级别等)，我们发现注解的配置由`TransactionAttributeSource`提供  
我们只需要重写`TransactionAttributeSource`，并应用即可

## 代码

```java
@Slf4j
@Configuration
@Role(BeanDefinition.ROLE_INFRASTRUCTURE)
public class TransactionRollbackSupport implements BeanPostProcessor, Ordered {

    private final AnnotationTransactionAttributeSource allRollback = new AnnotationTransactionAttributeSource() {
        @Override
        protected TransactionAttribute computeTransactionAttribute(Method method, Class<?> targetClass) {
            TransactionAttribute transactionAttribute = super.computeTransactionAttribute(method, targetClass);
            if (!(transactionAttribute instanceof RuleBasedTransactionAttribute)) {
                return transactionAttribute;
            }

            // 事务attributeRollback默认为Throwable,如果没有指定的话
            boolean hasRollbackRule = ((RuleBasedTransactionAttribute) transactionAttribute).getRollbackRules()
                    .stream()
                    .filter(t -> !(t instanceof NoRollbackRuleAttribute))
                    .anyMatch(Objects::nonNull);
            if (hasRollbackRule) {
                return transactionAttribute;
            }
            log.info("set Default transaction rollback exception as Throwable,class:{},method:{}", targetClass.getSimpleName(), method.getName());
            ((RuleBasedTransactionAttribute) transactionAttribute).getRollbackRules()
                    .add(0, new RollbackRuleAttribute(Throwable.class));

            return transactionAttribute;
        }
    };

    /**
     * @see ProxyTransactionManagementConfiguration#transactionAttributeSource()
     */
    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) throws BeansException {
        if (bean instanceof TransactionAspectSupport) {
            // 不管是proxy还是字节码切入，都是TransactionAspectSupport子类
            ((TransactionAspectSupport) bean).setTransactionAttributeSource(allRollback);
        }
        if (bean instanceof BeanFactoryTransactionAttributeSourceAdvisor) {
            // 如果是proxy方式，在代理bean的时候判断切入点时，会缓存事务的配置，所以基于proxy的方式也要使用该实现
            ((BeanFactoryTransactionAttributeSourceAdvisor) bean).setTransactionAttributeSource(allRollback);
        }
        return bean;
    }

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }
}
```