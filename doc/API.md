# 1. 获取工作区数据
---
- **接口名称**: `GET /workspaces`
- **描述**: 启动时获取所有工作区数据，包含由于全局设置等，但是不包含具体工作区的文件树数据。
- **请求方式**: `GET`
- **请求头**:
	- `Content-Type: application/json`

# 2. 更新工作区数据
---
- **接口名称**: `POST /workspaces`
- **描述**: 上传更新后的工作区数据。
- **请求方式**: `POST`
- **请求头**:
	- `Content-Type: application/json`
- **Body 参数**:
	- `workspaces`: 工作区列表对象 (JSON格式)，不包含具体工作区的文件树数据

# 3. 获取文件树数据
---
- **接口名称**: `GET /tree`
- **描述**: 获取指定工作区文件树数据。
- **请求方式**: `GET`
- **请求头**:
	- `Content-Type: application/json`
- **Query 参数**: 
	- `workspace`: 工作区id

# 4. 更新文件树数据
---
- **接口名称**: `POST /tree`
- **描述**: 更新指定工作区文件树数据。
- **请求方式**: `POST`
- **请求头**:
	- `Content-Type: application/json`
- **Query 参数**: 
	- `workspace`: 工作区id
- **Body 参数**:
	- `tree`: 该工作区的文件树对象 (JSON格式)

# 5. 更新对话内容
---
- **接口名称**: `POST /chat`
- **描述**: 更新对话内容。
- **请求方式**: `POST`
- **请求头**:
	- `Content-Type: application/json`
- **Query 参数**: 
	- `workspace`: 工作区id
	- `chat`: 对话id
- **Body 参数**:
	- 对话详情对象数据 (JSON格式，来自 DeepSeek 的历史对话返回结构)

# 6. 打开本地项目
---
- **接口名称**: `GET /project`
- **描述**: 请求打开文件夹对应的VSCode项目文件夹。
- **请求方式**: `GET`
- **请求头**:
	- `Content-Type: application/json`
- **Query 参数**: 
	- `workspace`: 工作区id
	- `folder`: 对应的文件夹路径或id