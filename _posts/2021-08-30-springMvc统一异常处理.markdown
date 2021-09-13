---
layout: post
title: springMvc统一异常处理
permalink: /springMvc统一异常处理
date: 2021-08-30 13:00:06.000000000 +08:00
categories: [java,spring]
tags: [代码规范,spring,异常拦截]
---

先配置处理异常的类，然后在分析源码

# mvc统一处理异常的实现

常见的异常如下，基本都是参数校验的异常。参数校验需要配合jsr303的注解校验哦。

```java
@Slf4j
@RestControllerAdvice
@ConditionalOnWebApplication // 只有web容器才会初始化
public class CommonExceptionHandler {

    /**
     * 本项目自定义的业务异常
     */
    @ExceptionHandler(BizException.class)
    public Object exceptionHandler(BizException e, HttpServletRequest request) {
        log.info("全局BizException异常params:" + WebUtils.getPrettyParam(request), e);
        return Result.toThis(e.getResultEnum(), e.getMessage(), e.getData());
    }

    @ExceptionHandler(RpcException.class)
    public Result<?> handleException(RpcException e) {
        // todo 需要系统通知
        log.info("全局异常--dubbo调用异常RPC_INVOKE_ERROR:", e);
        if (e.getCause() instanceof RemotingException) {
            // dubbo 提供者 不在线
            return Result.toThis(ResultEnum.RPC_INVOKE_ERROR, "服务提供者出现了问题\n" + e.getCause().getMessage());
        }
        // dubbo 未找到提供者
        return Result.toThis(ResultEnum.RPC_INVOKE_ERROR, "dubbo调用异常\n" + e.getMessage());
    }

    /**
     * 参数校验异常
     *
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public Object exceptionHandler(HttpMessageNotReadableException e, HttpServletRequest request) {
        log.info("全局方法参数校验异常HttpMessageNotReadableException,params:" + WebUtils.getPrettyParam(request), e);
        if (e.getRootCause() instanceof EnumDeserializeException) {
            return Result.toThis(ResultEnum.ERROR_ALERT, e.getRootCause().getMessage());
        }
        return Result.toThis(ResultEnum.ERROR_ALERT, "参数读取失败:" + e.getMessage());
    }

    /**
     * 参数校验异常
     *
     * @code 直接在方法参数上进行校验
     */
    @ExceptionHandler(ConstraintViolationException.class)
    public Object exceptionHandler(ConstraintViolationException e, HttpServletRequest request) {
        log.info("全局方法参数校验异常ConstraintViolationException,params:" + WebUtils.getPrettyParam(request), e);

        String message = e.getConstraintViolations().stream()
                .map(ConstraintViolation::getMessage)
                .collect(Collectors.joining(", "));

        return Result.toThis(ResultEnum.ERROR_ALERT, message);
    }

    /**
     * 处理所有接口数据验证异常
     *
     * @code @RequestBody 里面的字段
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public Result<?> handleMethodArgumentNotValidException(MethodArgumentNotValidException e, HttpServletRequest request) {
        log.info("全局方法参数校验异常MethodArgumentNotValidException,params:" + WebUtils.getPrettyParam(request), e);

        List<ObjectError> errors = e.getBindingResult().getAllErrors();
        String msg = errors.stream()
                .map(DefaultMessageSourceResolvable::getDefaultMessage)
                .distinct()
                .collect(Collectors.joining("\n"));
        return Result.toThis(ResultEnum.ERROR_ALERT, msg);
    }

    /**
     * 参数验证异常
     *
     * @code @ModelAttribute 里面的字段
     */
    @ExceptionHandler(BindException.class)
    public Object validateExp(BindException e, HttpServletRequest request) {
        log.info("全局方法参数校验异常BindException,params:" + WebUtils.getPrettyParam(request), e);
        String sb = e.getAllErrors().stream()
                .map(error -> {
                    try {
                        Object source = FieldUtils.readField(error, "source", true);
                        if (source instanceof TypeMismatchException) {
                            return getMessage((TypeMismatchException) source);
                        }
                        return error.getDefaultMessage();
                    } catch (IllegalAccessException ignored) {
                        return error.getDefaultMessage();
                    }
                }).distinct()
                .collect(Collectors.joining("\n"));

        return Result.toThis(ResultEnum.ERROR_ALERT, sb);
    }

    /**
     * 参数验证异常
     *
     * @code @RequestParam(required = true)
     */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public Object validateExp(MissingServletRequestParameterException e, HttpServletRequest request) {
        log.info("全局方法参数校验异常MissingServletRequestParameterException,params:" + WebUtils.getPrettyParam(request), e);
        log.info("类型{}, 字段{}, 不能为空，必填项", e.getParameterType(), e.getParameterName());
        return Result.toThis(ResultEnum.ERROR_ALERT, e.getParameterName() + "不能为空，必填项！类型：" + e.getParameterType());
    }

    /**
     * 参数验证异常 -- 对于springMVC接受参数类型转化问题
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public Object validateExp(MethodArgumentTypeMismatchException e, HttpServletRequest request) {
        log.warn("全局方法参数校验异常MethodArgumentTypeMismatchException,params:" + WebUtils.getPrettyParam(request), e);
        String message = getMessage(e);
        log.info(message);
        return Result.toThis(ResultEnum.ERROR_ALERT, message);
    }

    private String getMessage(TypeMismatchException e) {
        return "参数：" + e.getPropertyName() + ",值：" + e.getValue() + "，不能转成" + e.getRequiredType() + "类型！";
    }

    /**
     * 全局异常管理
     */
    @RestControllerAdvice
    @ConditionalOnWebApplication // 当前是web容器才会初始化
    public static class GlobalHandler {

        /**
         * 处理所有不可知的异常
         */
        @ExceptionHandler(Throwable.class)
        public Object handleException(Throwable e) {
            log.error("全局系统异常捕获", e);

            String stackStr = Arrays.stream(ObjectUtils.defaultIfNull(e.getStackTrace(), new StackTraceElement[0]))
                    .filter(t -> t.getClassName().startsWith("com") || t.getClassName().startsWith("cn"))
                    .filter(t -> t.getLineNumber() > 0)
                    .map(t -> t.getClassName() + "." + t.getMethodName() + ":" + t.getLineNumber())
                    .collect(Collectors.joining("\n"));
            stackStr = e.getClass() + ":" + e.getMessage() + "\n" + stackStr;

            return Result.toThis(ResultEnum.SYSTEM_ERROR, ResultEnum.SYSTEM_ERROR.getMessage(), stackStr);
        }

        // 不支持的请求-post-get-put-delete
        @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
        public Object validateExp(HttpRequestMethodNotSupportedException ex, HttpServletRequest request) {
            String method = request.getMethod();
            String supportList = Arrays.toString(ex.getSupportedMethods());
            log.warn("不支持的请求，uri:{},method:{},支持的请求:{}", request.getRequestURI(), method, supportList);
            return Result.toThis(ResultEnum.SYSTEM_ERROR, "不支持" + method + "请求，支持的请求：" + supportList);
        }

        // 不支持的请求-post-get-put-delete
        @ExceptionHandler(NoHandlerFoundException.class)
        public Object validateExp(NoHandlerFoundException ex, HttpServletRequest request) {
            log.warn("404，访问的接口地址:{},请求头:{}", request.getRequestURI(), WebUtils.getPrettyHeaders(request));
            return Result.toThis(ResultEnum.SYSTEM_ERROR, "访问接口不存在，联系开发人员");
        }

    }
}

```


# 源码分析

咱们一起来看看他是怎么生效的。为什么还区分全局和非全局？
[springMvc异常时的执行流程]({{ "/springMvc执行流程#总结" | relative_url }})