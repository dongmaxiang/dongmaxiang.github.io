---
layout: post
title: MybatisPlus语法糖的校验
permalink: /MybatisPlus语法糖的校验
date: 2021-08-22 17:43:20.000000000 +08:00
categories: [java,设计模式]
tags: [代码规范,mybatisPlus]
---


mybatisPlus用语法糖通过.点.点.即可完成sql的拼接。优点是显而易见的，但同样的避免不了缺点的产生。  
举个例子，你之前通过.点.点.完成的sql拼接。在各种各样service中可能会多处存在。  
虽然能快速满足咱们的业务是需求，但是对于后期维护人员来说是个不可磨灭的灾难，因为他不好定位到底是哪里有这样的逻辑。  
虽然我们可以定制规范来约束大家把.点.点.的sql拼接的语法封装成一个方法。但是在人员越来越多的情况下，没有强制的规范约束会变得越来越乱。  
所以我们规定建立一层Manger，用来管理sql的一层。如果想要使用MybatisPlus则必须[继承此BaseManager]({{ "/重新加装MybatisPlus#5避免空指针使api操作更安全" | relative_url }})。