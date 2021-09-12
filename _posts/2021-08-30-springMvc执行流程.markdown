---
layout: post
title: springMvc执行流程
permalink: /springMvc执行流程
date: 2021-08-30 15:18:37.000000000 +08:00
categories: [java,spring]
tags: [springMVC]
---

spring的MVC是遵循着servlet规范的。
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
我们知道springMVC的入口类dispatcherServlet，其实他也是servlet的实现类。那么他是如何和servlet容器关联上的呢，为什么所有的请求都由它管控呢？  

## 大体流程
1. 在springBoot容器启动流程中的[ContextRefresh阶段]({{ "/springBoot容器启动流程" | relative_url }})，context如果是ServletContext则会执行ServletContext的onStartup逻辑进行bind
1. bind逻辑通过ServletContextInitializerBeans和beanFactory获取以下实现类  
ServletContextInitializer、Filter、Servlet、ServletContextAttributeListener、ServletRequestListener、ServletRequestAttributeListener、HttpSessionAttributeListener、HttpSessionListener、ServletContextListener
1. 不是ServletContextInitializer的话，全部包装成ServletContextInitializer
1. 排序所有的ServletContextInitializer，进行迭代依次调用onStartup
1. onStartup时会把对应的urlMapping和servlet、filter、listener绑定到servletContext中

## 代码流程
```java
// servletContext会创建WebServer,该context为spring的容器上下文
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

* 为什么所有的请求都由它管控呢  
由DispatcherServletRegistrationBean注册dispatchServlet实例。  
DispatcherServletRegistrationBean继承自DispatcherServletPath  
getServletUrlMapping获取servletPath,然后addMapping到对应的servlet中  
  
```java
public interface DispatcherServletPath {
   ...
   default String getServletUrlMapping() {
      /* getPath() 为yml配置文件中的
       server:
         servlet:
           context-path: ...
       */
      if (getPath().equals("") || getPath().equals("/")) {
         return "/";
      }
      if (getPath().contains("*")) {
         return getPath();
      }
      if (getPath().endsWith("/")) {
         return getPath() + "*";
      }
      return getPath() + "/*";
   }

}
```

至此servletContext已经配置完毕。按照servlet容器的规范，我们的dispatcherServlet以及项目当中配置的filter，FilterRegistrationBean等配置都已经绑定好并生效。

# dispatcher正常执行流程

## 大体流程
1. 通过request从HandlerMapping获取HandlerExecutionChain（包含了handler和拦截器）
   handlerMapping：定位资源，不执行、不获取，只用来定位  
   * @RequestMapping：<small>handler默认由RequestMappingHandlerMapping提供=org.springframework.web.method.HandlerMethod</small>  
   * 静态资源：<small>handler默认由SimpleUrlHandlerMapping提供=org.springframework.web.servlet.resource.ResourceHttpRequestHandler</small>
1. 通过handler获取handlerAdaptor(真正执行handler的处理器)  
   handlerAdaptor: 根据定位的资源，进行获取(执行)  
   * @RequestMapping：<small>默认由org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter提供执行服务</small>    
   * 静态资源：<small>默认由org.springframework.web.servlet.mvc.HttpRequestHandlerAdapter提供执行服务</small>
1. 如果资源可以复用（未修改），直接返回304，由handlerAdaptor提供服务
1. 执行前置拦截器interceptor，返回false不允许往下执行
1. 由handlerAdaptor执行handler的逻辑并返回modelAndView  
1. 执行后置拦截器interceptor
1. 根据modelAndView或者执行期间捕获的exception处理最终的响应

> spring的MVC常用的配置，默认由org.springframework.boot.autoconfigure.web.servlet.WebMvcAutoConfiguration提供  
> 如静态资源、拦截器、跨域请求、@RequestMapping对应的方法等等。。。

## 代码流程
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
         // @RequestMapping：默认由RequestMappingHandlerMapping提供handler=org.springframework.web.method.HandlerMethod
         mappedHandler = getHandler(processedRequest);
         if (mappedHandler == null) {
            // 404处理 
            noHandlerFound(processedRequest, response);
            return;
         }

         // 获取执行handler的适配器。
         // @RequestMapping，默认由org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter提供执行服务
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

         /*
          @RequestMapping方法的执行逻辑：     
          RequestMappingHandlerAdapter执行HandlerMethod时，会通过ServletInvocableHandlerMethod执行HandlerMethod中的方法
          */
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

## @RequestMapping方法提供者-RequestMappingHandlerMapping

RequestMappingHandlerMapping在初始化时会把所有带有@Controller注解或者@RequestMapping注解的bean解析    
然后把@RequestMapping对应的url和对应的方法(bean和method)绑定到MappingRegistry(MultiValueMap类型)中：key为uri，value为多个HandlerMethod  
dispatcherServlet在获取对应的Handler时，根据UrlPathHelper从request获取请求的uri(去除contextPath和双斜杠之后的uri)。在根据uri从MappingRegistry获取对应的handlerMethod(可能为0个,1个，多个)  
如果获取不到可能是restful的接口，则需要遍历所有的接口。根据AntPathMatcher进行挨个匹配，直到循环完所有的mapping  
此时handlerMethod可能为空，为1个，甚至为多个，然后再从中选取最优的

* @RequestMapping注册的逻辑  
```java
class MappingRegistry {
    ...
    //mapping为@RequestMapping的信息
    public void register(T mapping, Object handler, Method method) {
        this.readWriteLock.writeLock().lock();
        try {
            HandlerMethod handlerMethod = createHandlerMethod(handler, method);// HandlerMethod包含了bean和对应的method
            validateMethodMapping(handlerMethod, mapping);// 验证@RequestMapping注解不能出现重复的值
            this.mappingLookup.put(mapping, handlerMethod);

            List<String> directUrls = getDirectUrls(mapping);// 获取@RequestMapping的url（direct：不包含"*"、"?"、"{"、"}"符合的url）
            for (String url : directUrls) {
                this.urlLookup.add(url, mapping);
            }
            ...
            // 处理跨域@CrossOrigin的注解
            CorsConfiguration corsConfig = initCorsConfiguration(handler, method, mapping);
            if (corsConfig != null) {
                this.corsLookup.put(handlerMethod, corsConfig);// 保存跨域的注解，后期由CorsInterceptor来处理跨域的信息
            }
            ...
        } finally {
            this.readWriteLock.writeLock().unlock();
        }
    }
    ...
}
```

* 根据请求获取对应的@RequestMapping  
```java
// 部分源码
public abstract class AbstractHandlerMethodMapping<T> extends AbstractHandlerMapping implements InitializingBean {
    ...
    protected HandlerMethod lookupHandlerMethod(String lookupPath, HttpServletRequest request) throws Exception {
        List<Match> matches = new ArrayList<>();
        // 根据uri直接获取
        List<T> directPathMatches = this.mappingRegistry.getMappingsByUrl(lookupPath);
        if (directPathMatches != null) {
            // uri匹配的mapping，需要判断其他的配置是否匹配，比如@RequestMapping(params = "abc=123", method = RequestMethod.POST)
            addMatchingMappings(directPathMatches, matches, request);
        }
        // 为空可能为restful风格，需要遍历所有的接口 原文：No choice but to go through all mappings...
        if (matches.isEmpty()) {
            addMatchingMappings(this.mappingRegistry.getMappings().keySet(), matches, request);
        }
    
        if (!matches.isEmpty()) {
            Match bestMatch = matches.get(0);
            // 获取最优的接口
            if (matches.size() > 1) {
                Comparator<Match> comparator = new MatchComparator(getMappingComparator(request));// 选取最优逻辑的排序器
                matches.sort(comparator);
                bestMatch = matches.get(0);
                // 如果是预检请求直接返回一个预检的handler代表已匹配，但是预检请求并不会真正的执行，注意：只有大于2个handler时才会返回，这是因为预检请求和真实请求可能header或参数不一样。无法精确匹配handler
                if (CorsUtils.isPreFlightRequest(request)) {
                    return PREFLIGHT_AMBIGUOUS_MATCH;
                }
                if (comparator.compare(bestMatch, matches.get(1)) == 0) {
                    // 选择不了最优的接口直接抛异常
                    throw new IllegalStateException(...);
                }
            }
            ...
            return bestMatch.handlerMethod;
        } else {
            return null;
        }
    }
    ...
}
```

## 多个@RequestMapping时选择最优的匹配
如以下几个配置
1. ```@RequestMapping(value = "*", headers = "content-type=text/*", method = RequestMethod.POST)```  
1. ```@RequestMapping(value = "/abc/*", method = RequestMethod.GET)```
1. ```@RequestMapping(value = "/abc/{id}", params = "abc=123")```
1. ```@RequestMapping(value = "/abc/def")```

如果请求地址为 /abc/def,那么会直接匹配第四个注解。
> 如果url无占位符号、通用符号，那么会根据url进行直接匹配

如果请求地址为 /abc/123?abc=123，则都会匹配前三个的RequestMapping，那么是如何选取最优的呢？

1. 如果request请求是head方法，则优先匹配方法一致的  
   method = RequestMethod.HEAD
1. 然后再次匹配pattern精度比较高的
1. 匹配params精度比较高的  
   params = "abc=123"
1. 匹配headers精度比较高的  
   headers = "content-type=text/*"
1. consumers精度比较高的
1. produces精度比较高的
1. method精度比较高的
   
源码：  
```java
public final class RequestMappingInfo implements RequestCondition<RequestMappingInfo> {
    ...
    public int compareTo(RequestMappingInfo other, HttpServletRequest request) {
        int result;
        // Automatic vs explicit HTTP HEAD mapping
        if (HttpMethod.HEAD.matches(request.getMethod())) {
            result = this.methodsCondition.compareTo(other.getMethodsCondition(), request);
            if (result != 0) {
                return result;
            }
        }
        result = this.patternsCondition.compareTo(other.getPatternsCondition(), request);
        if (result != 0) {
            return result;
        }
        result = this.paramsCondition.compareTo(other.getParamsCondition(), request);
        if (result != 0) {
            return result;
        }
        result = this.headersCondition.compareTo(other.getHeadersCondition(), request);
        if (result != 0) {
            return result;
        }
        result = this.consumesCondition.compareTo(other.getConsumesCondition(), request);
        if (result != 0) {
            return result;
        }
        result = this.producesCondition.compareTo(other.getProducesCondition(), request);
        if (result != 0) {
            return result;
        }
        // Implicit (no method) vs explicit HTTP method mappings
        result = this.methodsCondition.compareTo(other.getMethodsCondition(), request);
        if (result != 0) {
            return result;
        }
        result = this.customConditionHolder.compareTo(other.customConditionHolder, request);
        if (result != 0) {
            return result;
        }
        return 0;
    }
    ...
}
```

## RequestMappingHandlerAdapter
@RequestMapping对应的方法最终会封装成一个HandlerMethod，由RequestMappingHandlerAdapter执行HandlerMethod  
但在RequestMappingHandlerAdapter内部，把执行权交给了ServletInvocableHandlerMethod，该类继承自HandlerMethod

### <span id="ServletInvocableHandlerMethod">ServletInvocableHandlerMethod</span>
1. ServletInvocableHandlerMethod调用之前会组装(bind)参数    
1. bind参数需要获取方法参数上的参数名,默认提供者：DefaultParameterNameDiscoverer    
1. 以及根据参数名从request获取对应的value，默认提供者：RequestMappingHandlerAdapter#getDefaultArgumentResolvers。**ps:通过实现WebMvcConfigurer#addArgumentResolvers，可自定义参数解析器**  
1. 组装好参数之后ServletInvocableHandlerMethod通过反射调用真正的@RequestMapping对应的方法  
1. 调用出现异常会把异常抛出去，由[dispatcher处理](#dispatcher错误执行流程)  
1. 调用方法后返回的结果会通过HandlerMethodReturnValueHandler处理响应，默认提供者：RequestMappingHandlerAdapter#getDefaultReturnValueHandlers。**ps:通过实现WebMvcConfigurer#addReturnValueHandlers可自定义返回值处理**  
1. returnValue处理完之后动态的返回modelAndView**ps:如果是@ResponseBody则返回null，因为返回值已经在内部处理了，其他的如重定向、重转发、返回页面渲染等通过modelAndView完成**

# <span id='dispatcher错误执行流程'>dispatcher错误执行流程</span>  
常见的错误有
1. 404
2. @RequestMapping请求方式不对。
3. 参数转换异常
4. 参数校验失败
5. **逻辑处理异常**
6. ...等其他的不常见异常

## 大体流程
1. dispatcherServlet遇到异常会通过内部的方法processHandlerException遍历HandlerExceptionResolver的实现类处理异常
1. HandlerExceptionResolver的默认提供者```org.springframework.web.servlet.config.annotation.WebMvcConfigurationSupport#addDefaultHandlerExceptionResolvers```  
   @ExceptionHandler的注解，由ExceptionHandlerExceptionResolver处理
1. ExceptionHandlerExceptionResolve处理异常时：通过异常的类型找出能处理的方法
   ```ExceptionHandlerExceptionResolver#getExceptionHandlerMethod```找出能处理对应异常类型的方法
   如果handler不为空代表在执行handler期间遇到的异常 ，优先从当前handler找出能处理对应异常的@ExceptionHandler注解方法  
   如果handler为空或handler找不到能处理异常的方法，则从全局@ControllerAdvice注解的类中找出能处理对应异常的@ExceptionHandler注解方法
1. 获取然后包装成[ServletInvocableHandlerMethod](#ServletInvocableHandlerMethod)，并把执行权交给它
1. 如果ServletInvocableHandlerMethod在执行异常处理期间遇到了异常则```return null```,交由下一个HandlerExceptionResolver的实现类接着处理原先的异常 

## 代码流程

1. dispatcherServlet遇到异常会通过内部的方法processHandlerException遍历HandlerExceptionResolver的实现类处理异常  
```java
public class DispatcherServlet extends FrameworkServlet {
	protected ModelAndView processHandlerException(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) throws Exception {
        ...
		ModelAndView exMv = null;
		if (this.handlerExceptionResolvers != null) {
		    // 遍历HandlerExceptionResolver的实现类处理异常
			for (HandlerExceptionResolver resolver : this.handlerExceptionResolvers) {
				exMv = resolver.resolveException(request, response, handler, ex);
				if (exMv != null) {
					break;
				}
			}
		}
		if (exMv != null) {
			if (exMv.isEmpty()) {// @ResponseBody已处理
				request.setAttribute(EXCEPTION_ATTRIBUTE, ex);
				return null;
			}
			if (!exMv.hasView()) {// 重定向、重转发、页面渲染等
				String defaultViewName = getDefaultViewName(request);
				if (defaultViewName != null) {
					exMv.setViewName(defaultViewName);
				}
			}
			...
			return exMv;
		}
		...
	}
}
```

1. ExceptionHandlerExceptionResolve处理异常时：通过异常的类型找出能处理的方法  
   获取然后包装成[ServletInvocableHandlerMethod](#ServletInvocableHandlerMethod)，并把执行权交给它  
```java
public class ExceptionHandlerExceptionResolver extends AbstractHandlerMethodExceptionResolver implements ApplicationContextAware, InitializingBean {
	protected ModelAndView doResolveHandlerMethodException(HttpServletRequest request, HttpServletResponse response, HandlerMethod handlerMethod, Exception exception) {
        // 通过异常的类型找出能处理的方法
		ServletInvocableHandlerMethod exceptionHandlerMethod = getExceptionHandlerMethod(handlerMethod, exception);
		if (exceptionHandlerMethod == null) {
			return null;
		}

		if (this.argumentResolvers != null) {
			exceptionHandlerMethod.setHandlerMethodArgumentResolvers(this.argumentResolvers);
		}
		if (this.returnValueHandlers != null) {
			exceptionHandlerMethod.setHandlerMethodReturnValueHandlers(this.returnValueHandlers);
		}

		ServletWebRequest webRequest = new ServletWebRequest(request, response);
		ModelAndViewContainer mavContainer = new ModelAndViewContainer();

		try {
			Throwable cause = exception.getCause();
			if (cause != null) {
				exceptionHandlerMethod.invokeAndHandle(webRequest, mavContainer, exception, cause, handlerMethod);
			}
			else {
				exceptionHandlerMethod.invokeAndHandle(webRequest, mavContainer, exception, handlerMethod);
			}
		}
		catch (Throwable invocationEx) {
			return null;
		}

		// 如果已经对response做过处理
		if (mavContainer.isRequestHandled()) {
			return new ModelAndView();
		}
		...
	}

   /*
    ```ExceptionHandlerExceptionResolver#getExceptionHandlerMethod```找出能处理对应异常类型的方法
   */
   protected ServletInvocableHandlerMethod getExceptionHandlerMethod(HandlerMethod handlerMethod, Exception exception) {
      Class<?> handlerType = null;
      // 如果handler不为空代表在执行handler期间遇到的异常 ，优先从当前handler找出能处理对应异常的@ExceptionHandler注解方法
      if (handlerMethod != null) {
         handlerType = handlerMethod.getBeanType();
         Method method = new ExceptionHandlerMethodResolver(handlerType).resolveMethod(exception);
         if (method != null) {
            return new ServletInvocableHandlerMethod(handlerMethod.getBean(), method);
         }
         if (Proxy.isProxyClass(handlerType)) {
            handlerType = AopUtils.getTargetClass(handlerMethod.getBean());
         }
      }

      // 如果handler为空或handler找不到能处理异常的方法，则从全局@ControllerAdvice注解的类中找出能处理对应异常的@ExceptionHandler注解方法
      for (Map.Entry<ControllerAdviceBean, ExceptionHandlerMethodResolver> entry : this.exceptionHandlerAdviceCache.entrySet()) {
         ControllerAdviceBean advice = entry.getKey();
         if (advice.isApplicableToBeanType(handlerType)) {
            ExceptionHandlerMethodResolver resolver = entry.getValue();
            Method method = resolver.resolveMethod(exception);
            if (method != null) {
               return new ServletInvocableHandlerMethod(advice.resolveBean(), method);
            }
         }
      }

      return null;
   }

}
```