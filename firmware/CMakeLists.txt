cmake_minimum_required(VERSION 3.16)
file(READ "${CMAKE_CURRENT_LIST_DIR}/main/version.json" ems_release_json)
string(JSON ems_version GET "${ems_release_json}" version)
set(PROJECT_VER "${ems_version}")
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(wallbox_ems)

