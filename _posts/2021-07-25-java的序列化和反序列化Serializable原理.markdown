---
layout: post
title: java的序列化和反序列化Serializable原理
permalink: /java的序列化和反序列化Serializable原理
date: 2021-07-25 15:19:00.000000000 +08:00
categories: [java,基础]
tags: [序列化,反序列化]
---

## 背景
实现Serializable接口就能把对象序列化反序列化出去，那么原理是什么呢？  
带着以下问题一探究竟  
* 为什么实现这个接口就能序列化和反序列化呢？
* 序列化和反序列化的内容是什么呢，可以自定义吗？

## 为什么实现这个接口就能序列化和反序列化呢

* java序列化代码  
```java
public static void main(String[] args) throws IOException {
    Object o = new Serializable() {
        String strValue = "这是内容";
        Integer intValue = 999;
    };
    File file = new File(System.getProperty("java.io.tmpdir"), "serializable/");
    ObjectOutputStream objectOutputStream = new ObjectOutputStream(new FileOutputStream(file));
    objectOutputStream.writeObject(o);
}
```

这样就会把对象序列化到指定的文件中，我们点开writeObject方法看源码一探究竟  
```java
private void writeObject0(Object obj, boolean unshared)
        throws IOException
    {
        boolean oldMode = bout.setBlockDataMode(false);
        depth++;
        try {
            // handle previously written and non-replaceable objects
            int h;
            if ((obj = subs.lookup(obj)) == null) {
                writeNull();
                return;
            } else if (!unshared && (h = handles.lookup(obj)) != -1) {
                writeHandle(h);
                return;
            } else if (obj instanceof Class) {
                writeClass((Class) obj, unshared);
                return;
            } else if (obj instanceof ObjectStreamClass) {
                writeClassDesc((ObjectStreamClass) obj, unshared);
                return;
            }

            // check for replacement object
            Object orig = obj;
            Class<?> cl = obj.getClass();
            ObjectStreamClass desc;
            for (;;) {
                // REMIND: skip this check for strings/arrays?
                Class<?> repCl;
                desc = ObjectStreamClass.lookup(cl, true);
                // 如果有无参的writeReplace且返回值为Object类型的方法则会调用
                if (!desc.hasWriteReplaceMethod() ||
                    (obj = desc.invokeWriteReplace(obj)) == null ||
                    (repCl = obj.getClass()) == cl)
                {
                    break;
                }
                cl = repCl;
            }
            if (enableReplace) {
                Object rep = replaceObject(obj);
                if (rep != obj && rep != null) {
                    cl = rep.getClass();
                    desc = ObjectStreamClass.lookup(cl, true);
                }
                obj = rep;
            }

            // if object replaced, run through original checks a second time
            if (obj != orig) {
                subs.assign(orig, obj);
                if (obj == null) {
                    writeNull();
                    return;
                } else if (!unshared && (h = handles.lookup(obj)) != -1) {
                    writeHandle(h);
                    return;
                } else if (obj instanceof Class) {
                    writeClass((Class) obj, unshared);
                    return;
                } else if (obj instanceof ObjectStreamClass) {
                    writeClassDesc((ObjectStreamClass) obj, unshared);
                    return;
                }
            }

            // remaining cases
            if (obj instanceof String) {
                writeString((String) obj, unshared);
            } else if (cl.isArray()) {
                writeArray(obj, desc, unshared);
            } else if (obj instanceof Enum) {
                writeEnum((Enum<?>) obj, desc, unshared);
            } else if (obj instanceof Serializable) {
                // 这里是重点，如果序列化的对象不是Serializable的实现类，else就会报错
                writeOrdinaryObject(obj, desc, unshared);
            } else {
                if (extendedDebugInfo) {
                    throw new NotSerializableException(
                        cl.getName() + "\n" + debugInfoStack.toString());
                } else {
                    throw new NotSerializableException(cl.getName());
                }
            }
        } finally {
            depth--;
            bout.setBlockDataMode(oldMode);
        }
    }
```

所以要想[反]序列化对象，类型必须是String\|array\|enum\|Serializable\|class，不然就会直接报错

* writeOrdinaryObject
```java
private void writeOrdinaryObject(Object obj,
                                     ObjectStreamClass desc,
                                     boolean unshared)
        throws IOException
    {
        try {
            bout.writeByte(TC_OBJECT);
            writeClassDesc(desc, false);
            handles.assign(unshared ? null : obj);
            // 实现java.io.Externalizable接口，可自定义[反]序列化的内容
            if (desc.isExternalizable() && !desc.isProxy()) {
                writeExternalData((Externalizable) obj);
            } else {
                writeSerialData(obj, desc);
            }
        } finally {
            if (extendedDebugInfo) {
                debugInfoStack.pop();
            }
        }
    }
```

* writeSerialData
```java
private void writeSerialData(Object obj, ObjectStreamClass desc)
        throws IOException
    {
        ObjectStreamClass.ClassDataSlot[] slots = desc.getClassDataLayout();
        for (int i = 0; i < slots.length; i++) {
            ObjectStreamClass slotDesc = slots[i].desc;
            // 当前对象[反]序列化工具类的包装，
            // 如果没有实现java.io.Externalizable自定义[反]序列化接口也没关系
            // 直接把writeObject(序列化)和readObject(反序列化)名称写在你自己的类当中，也可以自定义[反]序列化的内容哦
            if (slotDesc.hasWriteObjectMethod()) {
                PutFieldImpl oldPut = curPut;
                curPut = null;
                SerialCallbackContext oldContext = curContext;

                if (extendedDebugInfo) {
                    debugInfoStack.push(
                        "custom writeObject data (class \"" +
                        slotDesc.getName() + "\")");
                }
                try {
                    curContext = new SerialCallbackContext(obj, slotDesc);
                    bout.setBlockDataMode(true);
                    slotDesc.invokeWriteObject(obj, this);
                    bout.setBlockDataMode(false);
                    bout.writeByte(TC_ENDBLOCKDATA);
                } finally {
                    curContext.setUsed();
                    curContext = oldContext;
                    if (extendedDebugInfo) {
                        debugInfoStack.pop();
                    }
                }

                curPut = oldPut;
            } else {
                // 直接获取对象内的字段，进行递归[反]序列化
                defaultWriteFields(obj, slotDesc);
            }
        }
    }
```
* defaultWriteFields
```java
private void defaultWriteFields(Object obj, ObjectStreamClass desc)
        throws IOException
    {
        Class<?> cl = desc.forClass();
        if (cl != null && obj != null && !cl.isInstance(obj)) {
            throw new ClassCastException();
        }

        desc.checkDefaultSerialize();

        // 优先输出基本类型
        int primDataSize = desc.getPrimDataSize();
        if (primVals == null || primVals.length < primDataSize) {
            primVals = new byte[primDataSize];
        }
        desc.getPrimFieldValues(obj, primVals);
        bout.write(primVals, 0, primDataSize, false);

        ObjectStreamField[] fields = desc.getFields(false);
        Object[] objVals = new Object[desc.getNumObjFields()];
        int numPrimFields = fields.length - objVals.length;
        desc.getObjFieldValues(obj, objVals);
        for (int i = 0; i < objVals.length; i++) {
            if (extendedDebugInfo) {
                debugInfoStack.push(
                    "field (class \"" + desc.getName() + "\", name: \"" +
                    fields[numPrimFields + i].getName() + "\", type: \"" +
                    fields[numPrimFields + i].getType() + "\")");
            }
            try {
                // 继续递归调用
                writeObject0(objVals[i],
                             fields[numPrimFields + i].isUnshared());
            } finally {
                if (extendedDebugInfo) {
                    debugInfoStack.pop();
                }
            }
        }
    }
```

至此，序列化原理分析完毕，大体总结一下
* 除基本类型和String、Enum、class和array外，其他类型想要[反]序列化，必须实现Serializable接口，不然直接报错  
* 自定义[反]序列化内容有两种方法，一是直接写方法(writeObject(序列化)|readObject(反序列化))到自己的类中，二是实现java.io.Externalizable接口.  
  writeObject参数类型是ObjectOutputStream  
  readObject参数类型是ObjectInputStream  
  **方法返回类型必须为void，private，非static**
  
