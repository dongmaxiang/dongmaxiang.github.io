---
layout: post
title: springMvc执行流程
permalink: /springMvc执行流程
date: 2021-08-30 15:18:37.000000000 +08:00
categories: [java,spring]
tags: [springMVC]
---

# servlet规范
当Http服务器接收请求后，Http服务器不直接调用业务类，而是把请求交给Servlet容器去处理，Servlet容器会将请求转发到具体的Servlet   
Servlet是个接口，如果想要让业务类具备处理请求的能力则需要实现此并接口，并配置到web.xml当中即可。  
调用servlet时如果还没创建，就加载并实例化这个Servlet，然后调用这个Servlet的service方法  
```java
public interface Servlet {
    // Servlet容器在加载Servlet类的时候会调用init方法
    void init(ServletConfig config) throws ServletException;
    
    // ServletConfig就是封装Servlet的初始化参数。可以在web.xml给Servlet配置参数
    ServletConfig getServletConfig();

    // 处理请求
    void service(ServletRequest req, ServletResponse res) throws ServletException, IOException;
    
    String getServletInfo();
    
    // Servlet容器在卸载Servlet类的时候会调用destory方法
    void destroy();
}
```

# springBoot的DispatcherServlet关联到servlet容器中
我们知道springMVC的入口类dispatcherServlet，其实他也是servlet的实现类。那么他是如何和servlet容器关联上的呢？  
在springBoot容器启动流程中的[refresh阶段]({{ "/springBoot容器启动流程" | relative_url }})，会执行ServletContext实例的onStartup逻辑。

## 大体流程
1. 通过ServletContextInitializerBeans和beanFactory获取以下实现类  
ServletContextInitializer、Filter、Servlet、ServletContextAttributeListener、ServletRequestListener、ServletRequestAttributeListener、HttpSessionAttributeListener、HttpSessionListener、ServletContextListener
1. 不是ServletContextInitializer的话，全部包装成ServletContextInitializer
1. 排序所有的ServletContextInitializer，进行迭代依次调用onStartup
1. onStartup会绑定到servletContext中

## 代码流程
```java
// servletContext会创建WebServer
public class ServletWebServerApplicationContext extends GenericWebApplicationContext implements ConfigurableWebServerApplicationContext {
...
    // onRefresh是在refresh阶段调用的
    protected void onRefresh() {
        super.onRefresh();
        ...
        createWebServer();
        ...
    }
    // 创建webServer
    private void createWebServer() {
        
        // 为了阅读方便，我把代码直接写在这里。最终处理注册的实现类
        ServletContextInitializer initializer = new ServletContextInitializer() {
            public void onStartup(ServletContext servletContext) {
                // 1 绑定当前context到servletContext中
                // 2 新增scope为application，和servlertContext关联上
                // 3 把servletContextParam绑定到Environment
                ...
                for (ServletContextInitializer beans : new ServletContextInitializerBeans(getBeanFactory())) {
                    beans.onStartup(servletContext);
                }
            }
        }; 
        
        // 创建内嵌的webServer后在调用onStartup
        if (this.webServer == null && getServletContext() == null) {
            this.webServer = getWebServerFactory().getWebServer(initializer);
            ...
        }
        else if (servletContext != null) {
            ...
            // 非内嵌的WebServer，直接调用onStartup
            initializer.onStartup(servletContext);
            ...
        }
    }
}
```
onStartup方法通过ServletContextInitializerBeans最终获取了一批ServletContextInitializer类型的处理类，然后调用各自的onStartup完成的注册。
> ServletContextInitializer是个接口，只提供onStartup方法。具体实现有filter注册、servlet注册、Listener注册器等。  
> 不同的实现会调用不同的方法，如filter只会调用servletContext.addFilter();

ServletContextInitializer是根据ServletContextInitializerBeans以及BeanFactory获取到的。继续分析获取的流程  
```java
public class ServletContextInitializerBeans extends AbstractCollection<ServletContextInitializer> {
    private final Set<Object> seen = new HashSet<>(); // 以及添加过的bean，不允许再次添加
    
    // 所有的需要注册的bean,key为类型。
    private final MultiValueMap<Class<?>, ServletContextInitializer> initializers = new LinkedMultiValueMap<>();
    // 排序过后的所有要注册的bean
    private List<ServletContextInitializer> sortedList;
    
    // 最终迭代的对象为sortedList，sortedList是通过initializers的values排序之后的结果
    @Override
    public Iterator<ServletContextInitializer> iterator() {
        return this.sortedList.iterator();
    }

    @Override
    public int size() {
        return this.sortedList.size();
    }

    public ServletContextInitializerBeans(ListableBeanFactory beanFactory) {
        ...
        // 通过beanFactory获取ServletContextInitializer实例
        for (Entry<String, ? extends ServletContextInitializer> initializerBean : getOrderedBeansOfType(beanFactory, ServletContextInitializer.class)) {
            // 添加到成员initializers中
            addServletContextInitializerBean(initializerBean.getKey(), initializerBean.getValue(), beanFactory);
        }
        /* 通过beanFactory直接获取以下实例
         Servlet、Filter、
         ServletContextAttributeListener、ServletRequestListener、ServletRequestAttributeListener、
         HttpSessionAttributeListener、HttpSessionListener、ServletContextListener
         */
        addAdaptableBeans(beanFactory);
        // 最终排序
        this.sortedList = this.initializers.values().stream()
                .flatMap((value) -> value.stream().sorted(AnnotationAwareOrderComparator.INSTANCE))
                .collect(Collectors.toList());
    }
    
    // 通过beanFactory获取ServletContextInitializer实例
    private void addServletContextInitializerBean(String beanName, ServletContextInitializer initializer, ListableBeanFactory beanFactory) {
        // 简化代码阅读
        ...
        Class<?> type;
        Object source;
        if (initializer instanceof ServletRegistrationBean) {
            source = ((ServletRegistrationBean<?>) initializer).getServlet();
            type = Servlet.class;
        }
        else if (initializer instanceof FilterRegistrationBean) {
            source = ((FilterRegistrationBean<?>) initializer).getFilter();
            type = Filter.class;
        }
        else if (initializer instanceof DelegatingFilterProxyRegistrationBean) {
            source = ((DelegatingFilterProxyRegistrationBean) initializer).getTargetBeanName();
            type = Filter.class;
        }
        else if (initializer instanceof ServletListenerRegistrationBean) {
            source = ((ServletListenerRegistrationBean<?>) initializer).getListener();
            type = EventListener.class;
        }
        else {
            source = initializer;
            type = ServletContextInitializer.class;
        }
        this.initializers.add(type, initializer);
        if (source != null) {
            // 防止重复添加，不同的包装获取source的方式不同
            // Mark the underlying source as seen in case it wraps an existing bean
            this.seen.add(source);
        }
    }

    /* 通过beanFactory直接获取以下实例
         Servlet、Filter、
         ServletContextAttributeListener、ServletRequestListener、ServletRequestAttributeListener、
         HttpSessionAttributeListener、HttpSessionListener、ServletContextListener
     */
    protected void addAdaptableBeans(ListableBeanFactory beanFactory) {
        addAsRegistrationBean(beanFactory, Servlet.class, Servlet.class, new ServletRegistrationBeanAdapter(getMultipartConfig(beanFactory)));//Adapter = addServlet
        addAsRegistrationBean(beanFactory, Filter.class, Filter.class, new FilterRegistrationBeanAdapter());// Adapter = addFilter
        // supportedTypes = ServletContextAttributeListener、ServletRequestListener、ServletRequestAttributeListener、HttpSessionAttributeListener、HttpSessionListener、ServletContextListener
        for (Class<?> listenerType : ServletListenerRegistrationBean.getSupportedTypes()) {
            addAsRegistrationBean(beanFactory, EventListener.class, (Class<EventListener>) listenerType, new ServletListenerRegistrationBeanAdapter());// Adapter = addListener
        }
    }

    private <T, B extends T> void addAsRegistrationBean(ListableBeanFactory beanFactory, Class<T> type,
                                                        Class<B> beanType, RegistrationBeanAdapter<T> adapter) {
        for (Entry<String, B> entry : getOrderedBeansOfType(beanFactory, beanType, this.seen)) {
            String beanName = entry.getKey();
            B bean = entry.getValue();
            if (!this.seen.add(bean)) {
                continue;
            }
            RegistrationBean registration = adapter.createRegistrationBean(beanName, bean, entries.size());
            registration.setOrder(getOrder(bean));// 获取顺序
            this.initializers.add(type, registration);// 添加到成员当中
        }
    }
}
```
至此servletContext已经配置完毕。按照servlet容器的规范，我们的dispatcherServlet以及项目当中配置的filter，FilterRegistrationBean等配置都已经绑定好并生效。

# dispatcher正常执行流程
大体流程分为
1. 通过request从HandlerMapping获取HandlerExecutionChain（包含了handler和拦截器）
1. 通过handler获取handlerAdaptor(真正执行handler的处理器)
1. 如果资源可以复用（未修改），直接返回304，由handlerAdaptor提供服务
1. 执行前置拦截器interceptor，返回false不允许往下执行
1. 由handlerAdaptor执行handler的逻辑并返回modelAndView
1. 执行后置拦截器interceptor
1. 根据modelAndView或者执行期间捕获的exception处理最终的响应

```java
public class DispatcherServlet extends FrameworkServlet {
    
   ...
   // servlet最终会调用的方法
   protected void doDispatch(HttpServletRequest request, HttpServletResponse response) throws Exception {
      HttpServletRequest processedRequest = request;
      HandlerExecutionChain mappedHandler = null; // 本次请求request的处理器，包含了拦截器
      ...
      ModelAndView mv = null; //处理结果
      Exception dispatchException = null; // 处理遇到的异常
      try {
         ...
         // 通过request从HandlerMapping获取本次请求的handler(包含拦截器)
         // 默认写的controller里面的方法，handler=org.springframework.web.method.HandlerMethod
         // HandlerMethod默认由org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping提供
         mappedHandler = getHandler(processedRequest);
         if (mappedHandler == null) {
            // 404处理 
            noHandlerFound(processedRequest, response);
            return;
         }

         // 获取执行handler的适配器。
         // 默认写的controller里面的方法，spring默认由org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter提供执行服务
         HandlerAdapter ha = getHandlerAdapter(mappedHandler.getHandler());

         // 304。资源复用。
         String method = request.getMethod();
         boolean isGet = "GET".equals(method);
         if (isGet || "HEAD".equals(method)) {
            if (new ServletWebRequest(request, response).checkNotModified(ha.getLastModified(request, mappedHandler.getHandler())) && isGet) {
               return;
            }
         }
         
         // 调用拦截器pre的方法
         if (!mappedHandler.applyPreHandle(processedRequest, response)) {
            return;
         }

         // 进行method反射调用，调用之前会参数组装、参数校验等逻辑。有异常则会直接抛出
         // RequestMappingHandlerAdapter执行handler时，会组装参数、参数校验、并处理返回的结果
         mv = ha.handle(processedRequest, response, mappedHandler.getHandler());
         ...
         // 调用后置拦截器
         mappedHandler.applyPostHandle(processedRequest, response, mv);
      } catch (Exception ex) {
         dispatchException = ex;
      } catch (Throwable err) {
         dispatchException = new NestedServletException("Handler dispatch failed", err);
      }
      // 处理最终的结果，异常和结果都用同一个方法
      processDispatchResult(processedRequest, response, mappedHandler, mv, dispatchException);
      ...
   }
}
```

# dispatcher错误执行流程
常见的错误有
1. 404
2. get方式访问只允许post的接口。
3. 参数转换异常
4. 参数校验异常
5. 逻辑处理异常
6. ...等其他不常见的异常


# RequestMappingHandlerAdapter
