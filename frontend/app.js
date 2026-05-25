
let token = localStorage.getItem("token");

async function signup(){
  let email = document.getElementById("email").value;
  let password = document.getElementById("password").value;

  let res = await fetch("http://127.0.0.1:8000/signup", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({email,password})
  });

  let data = await res.json();
  localStorage.setItem("token", data.token);

  document.getElementById("out").innerText = JSON.stringify(data,null,2);
}

async function login(){
  let email = document.getElementById("email").value;
  let password = document.getElementById("password").value;

  let res = await fetch("http://127.0.0.1:8000/login", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({email,password})
  });

  let data = await res.json();
  localStorage.setItem("token", data.token);

  document.getElementById("out").innerText = JSON.stringify(data,null,2);
}

async function runScan(){
  let res = await fetch("http://127.0.0.1:8000/scan", {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":"Bearer " + localStorage.getItem("token")
    },
    body: JSON.stringify({
      rows:[
        {"amount":1200},
        {"amount":900},
        {"amount":400}
      ]
    })
  });

  let data = await res.json();
  document.getElementById("out").innerText = JSON.stringify(data,null,2);
}
