---
layout: post
title: MybatisPlus针对Saas系统的动态多租户插件
permalink: /MybatisPlus针对Saas系统的动态多租户插件
date: 2021-07-25 22:05:23.000000000 +08:00
categories: [java,mybatis]
tags: [mybatis,多租户]
---
多租户就是用额外的一个字段代表属主，只有属主的数据才能被当前用户操作  
**动态**就是有些表是公用的，没有多租户的概念。那么操作此表的时候需要排除

# 首先定义一个多租户的字段