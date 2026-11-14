' 开机自启：不弹窗地在后台跑小黑盒面板服务（127.0.0.1:7789）
' 用绝对路径，避免登录时 PATH 还没准备好
Dim fso, sh, logPath
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\Administrator\Desktop\小黑盒"
logPath = "C:\Users\Administrator\Desktop\小黑盒\启动日志.txt"
On Error Resume Next
sh.Run """D:\node\node.exe"" server.mjs", 0, False
If Err.Number <> 0 Then
  fso.CreateTextFile(logPath, True).WriteLine Now & " 启动失败：" & Err.Description
  Err.Clear
Else
  fso.CreateTextFile(logPath, True).WriteLine Now & " 已启动 node server.mjs"
End If
