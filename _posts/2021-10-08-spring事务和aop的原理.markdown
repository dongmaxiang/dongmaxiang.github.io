---
layout: post
title: spring事务和aop的原理
permalink: /spring事务和aop的原理
date: 2021-10-08 15:41:10.000000000 +08:00
categories: [java,spring]
tags: [spring,动态代理]
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
  基于xml配置方式`<aop:config>...</aop:config>`  
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

## 基于字节码增强

不同于proxy，字节码增强运行效率是比较快的，因为相当于我们手写的代码，且没有这么复杂的动态代理逻辑。更不会出现内嵌方法调用时aop不生效的情况  
> 但这种技术为什么没有流行起来呢？原因有两个  
> 1是需要通过运维支持在jvm 启动的时候添加 -javaagent:'jarPath' 命令，比较复杂(也可以通过技术手段在运行中获取到`Instrumentation`实例，不用运维配置)  
> 2是配置起来复杂，需要在代码层面提前配置好切入的表达式和对应的逻辑，且要保证切入的class没有提前加载才行  

1. 基于agent在class加载的时候进行动态的替换字节码  
   [字节码增强](/java-agent)技术-ASPECTJ     

2. 基于编译阶段做切入操作  
  [具体可google搜索class编译时做字节码切入](https://leon-wtf.github.io/springboot/2019/12/30/spring-aop-vs-aspectj/)


---
---

# 事务的原理
springBoot: `@EnableTransactionManagement`  
spring.xml: `<tx:annotation-driven/>`  
以上配置表明`@Transactional`注解即可生效，那么他的原理是什么呢？  

## 基于PROXY  
  注册一个aop实例，类型为`Advisor`，判断有@Transaction注解的就会自动动态代理  
  > 在方法调用的时候，aop拦截方法并执行`TransactionAspectSupport#invokeWithinTransaction`，根据`@Transaction`的配置进行开始事务、隔离配置、回滚等操作

* xml注册的代码  
  `AnnotationDrivenBeanDefinitionParser#parse`

* 注解注册的代码  
  `TransactionManagementConfigurationSelector#selectImports`

## 基于[字节码增强](/java-agent)  
字节码增强，spring兼容的不太好。因为字节码需要agent，并且需要class字节器转换器。基于字节码的切入，即使不开启事务的注解，也会生效，所以可以不用配置注解。    
只要保证要切入的类在加载之前agent能正常运行且有class转换器`org.springframework.transaction.aspectj.AnnotationTransactionAspect`即可  

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

<font color='red'>但是要注意这种方式只支持Proxy方式的事务，如果是基于字节码那么修改源码了（字节码的切入不受spring管控）</font>

## 代码

```java
@Slf4j
@Configuration
@Role(BeanDefinition.ROLE_INFRASTRUCTURE)
public class TransactionRollbackSupport implements BeanDefinitionRegistryPostProcessor {

    @Override
    public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) throws BeansException {

    }

    @Override
    public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {
        AbstractBeanDefinition transactionAttributeSource = (AbstractBeanDefinition) beanFactory.getBeanDefinition("transactionAttributeSource");
        transactionAttributeSource.setInstanceSupplier(AllRollback::new);
    }

    /**
     * @see ProxyTransactionManagementConfiguration#transactionAttributeSource()
     */
    private static class AllRollback extends AnnotationTransactionAttributeSource {
        @Override
        protected TransactionAttribute computeTransactionAttribute(Method method, Class<?> targetClass) {
            TransactionAttribute transactionAttribute = super.computeTransactionAttribute(method, targetClass);
            if (!(transactionAttribute instanceof RuleBasedTransactionAttribute)) {
                return transactionAttribute;
            }

            boolean hasRollbackRule = ((RuleBasedTransactionAttribute) transactionAttribute).getRollbackRules()
                    .stream()
                    .filter(t -> !(t instanceof NoRollbackRuleAttribute))
                    .anyMatch(Objects::nonNull);
            // 事务attributeRollback默认为Throwable,如果没有指定的话
            if (hasRollbackRule) {
                return transactionAttribute;
            }
            log.info("set Default transaction rollback exception as Throwable,class:{},method:{}", targetClass.getSimpleName(), method.getName());
            ((RuleBasedTransactionAttribute) transactionAttribute).getRollbackRules()
                    .add(0, new RollbackRuleAttribute(Throwable.class));

            return transactionAttribute;
        }
    }
}
```