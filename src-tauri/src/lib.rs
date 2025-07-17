// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use tauri::ipc::Channel;
use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
enum AgentEvent {
    Stdout { line: String },
    Stderr { line: String },
    Finished { success: bool },
    Error { message: String },
}

#[tauri::command]
async fn run_agent(model: String, prompt: String, on_event: Channel<AgentEvent>) -> Result<(), String> {
    let mut child = Command::new("opencode")
        .arg("run")
        .arg("-m")
        .arg(&model)
        .arg(&prompt)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            let error_msg = format!("Failed to execute command: {}", e);
            on_event.send(AgentEvent::Error { message: error_msg.clone() }).ok();
            error_msg
        })?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let stdout_reader = BufReader::new(stdout);
    let stderr_reader = BufReader::new(stderr);

    let on_event_stdout = on_event.clone();
    let on_event_stderr = on_event.clone();

    // Spawn tasks to handle stdout and stderr streaming
    let stdout_handle = tokio::spawn(async move {
        for line in stdout_reader.lines() {
            match line {
                Ok(line) => {
                    if on_event_stdout.send(AgentEvent::Stdout { line }).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    let stderr_handle = tokio::spawn(async move {
        for line in stderr_reader.lines() {
            match line {
                Ok(line) => {
                    if on_event_stderr.send(AgentEvent::Stderr { line }).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    // Wait for both stdout and stderr to finish
    let _ = tokio::join!(stdout_handle, stderr_handle);

    // Wait for the process to finish
    let status = child.wait().map_err(|e| format!("Failed to wait for process: {}", e))?;

    on_event.send(AgentEvent::Finished { success: status.success() }).ok();

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![run_agent])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
