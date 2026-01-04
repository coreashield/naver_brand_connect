' 카페 자동 글쓰기 - 백그라운드 실행 (창 숨김)
' 더블클릭하면 백그라운드에서 24시간 실행됩니다.
' 종료: 작업 관리자에서 node.exe 종료

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' 현재 스크립트 경로
scriptPath = fso.GetParentFolderName(WScript.ScriptFullName)

' 작업 디렉토리 변경 후 실행 (창 숨김 모드: 0)
WshShell.CurrentDirectory = scriptPath
WshShell.Run "cmd /c node cafe_writer.js", 0, False

' 실행 알림
MsgBox "카페 자동 글쓰기가 백그라운드에서 시작되었습니다." & vbCrLf & vbCrLf & _
       "종료하려면: 작업 관리자 > node.exe 종료" & vbCrLf & _
       "로그 확인: output\cafe_writer.log", vbInformation, "카페 글쓰기 시작"
