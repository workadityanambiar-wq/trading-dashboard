# Start both backend and frontend dev servers

# Backend
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$PSScriptRoot\backend'; pip install -r requirements.txt -q; & '$env:LOCALAPPDATA\Python\pythoncore-3.14-64\Scripts\uvicorn.exe' app.main:app --reload --port 8000"
) -WindowStyle Normal

# Frontend
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$PSScriptRoot\frontend'; npm install; npm run dev"
) -WindowStyle Normal

Write-Host "Servers starting:"
Write-Host "  Backend:  http://localhost:8000"
Write-Host "  Frontend: http://localhost:3000"
Write-Host "  API docs: http://localhost:8000/docs"
