terraform {
  required_version = ">= 1.6.0"
}

locals {
  project = "cyvxai-os"
  mode    = "placeholder"
}

output "cyvx_project" {
  value = local.project
}

output "cyvx_mode" {
  value = local.mode
}
