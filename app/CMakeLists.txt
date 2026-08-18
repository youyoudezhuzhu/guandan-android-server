cmake_minimum_required(VERSION 3.22.1)

# 编译 JNI 桥接库（native-lib），链接预编译的 libnode.so
add_library( native-lib
             SHARED
             src/main/cpp/native-lib.cpp )

# node 的头文件
include_directories(libnode/include/node/)

# 预编译的 node.js 运行时（由 CI 从 nodejs-mobile release 解压而来）
add_library( libnode
             SHARED
             IMPORTED )

set_target_properties( libnode
                       PROPERTIES IMPORTED_LOCATION
                       ${CMAKE_SOURCE_DIR}/libnode/bin/${ANDROID_ABI}/libnode.so )

find_library( log-lib log )

target_link_libraries( native-lib
                       libnode
                       ${log-lib} )
