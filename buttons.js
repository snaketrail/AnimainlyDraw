const canva = document.getElementById('canva');
function myFunction() {
    document.getElementById("myDropdown").classList.toggle("show");
}
window.onclick = function (event) {
    if (!event.target.matches('.btnInDrawDiv')) {
        let dropdowns = document.getElementsByClassName("dropdown-content");
        for (let i = 0; i < dropdowns.length; i++) {
            let openDropdown = dropdowns[i];
            if (openDropdown.classList.contains('show')) {
                openDropdown.classList.remove('show');
            }
        }
    }
}
function myFunction1() {
    document.getElementById("myDropdown1").classList.toggle("show");
}
window.onclick = function (event) {
    if (!event.target.matches('.btnInDrawDiv')) {
        let dropdowns = document.getElementsByClassName("dropdown-content");
        for (let i = 0; i < dropdowns.length; i++) {
            let openDropdown = dropdowns[i];
            if (openDropdown.classList.contains('show')) {
                openDropdown.classList.remove('show');
            }
        }
    }
}
function myFunction2() {
    document.getElementById("myDropdown2").classList.toggle("show");
}
window.onclick = function (event) {
    if (!event.target.matches('.btnInDrawDiv')) {
        let dropdowns = document.getElementsByClassName("dropdown-content");
        for (let i = 0; i < dropdowns.length; i++) {
            let openDropdown = dropdowns[i];
            if (openDropdown.classList.contains('show')) {
                openDropdown.classList.remove('show');
            }
        }
    }
}
function clear(){
    while (canva.firstChild) {
        canva.removeChild(canva.firstChild);
    };
}
document.getElementById('mainMenu').addEventListener('click', () => {
    location.href = 'index.html';
})
function undoIt(){
    canva.removeChild(canva.lastChild);
}
function clearCnavas(){
    while(canva.firstChild){
        canva.removeChild(canva.firstChild);
    };
};
document.getElementById('clearBtn').addEventListener('click', clear);
document.getElementById('undoBtn').addEventListener('click', undoIt);

document.getElementById('imgApartment').addEventListener('click', ()=>{

    canva.style.backgroundImage = "url(background1Fix.png)";
})
document.getElementById('imgShopping').addEventListener('click', ()=>{
    canva.style.backgroundImage = "url(shopping.png)";
})
document.getElementById('imgSchool').addEventListener('click', ()=>{
    canva.style.backgroundImage = "url(school.png)";
})
document.getElementById('imgPark').addEventListener('click', ()=>{
    canva.style.backgroundImage = "url(park.png)";
})

document.getElementById('girlBtn').addEventListener('click', () =>{

    let img = document.createElement('img');
    img.className = 'draggable';
    img.src = 'girl2.png';
    img.setAttribute('width', '300');
    img.setAttribute('height', '500');
    canva.appendChild(img);
    img.addEventListener('mouseover', () =>{
        img.style.border = 'black solid 2px';
    });
    img.addEventListener('mouseout', () =>{
        img.style.border = '';
    });
    // img.classList.remove('draggable');
    const position = { x: 0, y: 0 }

    interact('.draggable').draggable({
        listeners: {
            start (event) {
            },
            move (event) {
                position.x += event.dx
                position.y += event.dy

                event.target.style.transform =
                    `translate(${position.x}px, ${position.y}px)`;
            },
        }
    });
    interact('.draggable')
    .resizable({
      edges: { top: true, left: true, bottom: true, right: true },
      listeners: {
        move: function (event) {
          let { x, y } = event.target.dataset
  
          x = (parseFloat(x) || 0) + event.deltaRect.left
          y = (parseFloat(y) || 0) + event.deltaRect.top
  
          Object.assign(event.target.style, {
            width: `${event.rect.width}px`,
            height: `${event.rect.height}px`,
            transform: `translate(${x}px, ${y}px)`
          })
  
          Object.assign(event.target.dataset, { x, y })
        }
      }
    })

});

document.getElementById('boyBtn').addEventListener('click', () =>{

    let img = document.createElement('img');
    img.className = 'draggable';
    img.src = 'boy.png';
    img.setAttribute('width', '300');
    img.setAttribute('height', '500');
    canva.appendChild(img);
    img.addEventListener('mouseover', () =>{
      img.style.border = 'black solid 2px';
    });
    img.addEventListener('mouseout', () =>{
      img.style.border = '';
    });

    const position = { x: 0, y: 0 }

    interact('.draggable').draggable({
        listeners: {
            start (event) {
            },
            move (event) {
                position.x += event.dx
                position.y += event.dy

                event.target.style.transform =
                    `translate(${position.x}px, ${position.y}px)`;
            },
        }
    })
    interact('.draggable')
    .resizable({
      edges: { top: true, left: true, bottom: true, right: true },
      listeners: {
        move: function (event) {
          let { x, y } = event.target.dataset
  
          x = (parseFloat(x) || 0) + event.deltaRect.left
          y = (parseFloat(y) || 0) + event.deltaRect.top
  
          Object.assign(event.target.style, {
            width: `${event.rect.width}px`,
            height: `${event.rect.height}px`,
            transform: `translate(${x}px, ${y}px)`
          })
  
          Object.assign(event.target.dataset, { x, y })
        }
      }
    })
});

document.getElementById('textBtn').addEventListener('click', () =>{

    let ipField = document.createElement('textarea');
    ipField.className = 'inputEl';
    ipField.classList.add('draggable');
    ipField.style.backgroundColor = 'white';
    ipField.setAttribute('width', '400');
    ipField.setAttribute('height', '300');
    canva.appendChild(ipField);
    ipField.addEventListener('mouseover', () =>{
      ipField.style.border = 'black solid 2px';
    });
    ipField.addEventListener('mouseout', () =>{
      ipField.style.border = '';
    });

    const position = { x: 0, y: 0 }

    interact('.draggable').draggable({
        listeners: {
            start (event) {
            },
            move (event) {
                position.x += event.dx
                position.y += event.dy

                event.target.style.transform =
                    `translate(${position.x}px, ${position.y}px)`;
            },
        }
    })
    interact('.draggable')
    .resizable({
      edges: { top: true, left: true, bottom: true, right: true },
      listeners: {
        move: function (event) {
          let { x, y } = event.target.dataset
  
          x = (parseFloat(x) || 0) + event.deltaRect.left
          y = (parseFloat(y) || 0) + event.deltaRect.top
  
          Object.assign(event.target.style, {
            width: `${event.rect.width}px`,
            height: `${event.rect.height}px`,
            transform: `translate(${x}px, ${y}px)`
          })
  
          Object.assign(event.target.dataset, { x, y })
        }
      }
    })
});


