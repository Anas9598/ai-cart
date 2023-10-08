import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import OpenAI from 'openai';

import { ISelectedProduct, MeasureUnits } from './app-model';
import { products } from './product-list';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  file: any;
  transcription: string | undefined;
  lastTranscription: string | undefined;

  // apiKey = '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';

  @ViewChild('recorder', { read: ElementRef })
  set recorder(element: ElementRef) {
    this.recorderRef = element?.nativeElement;
  }
  @ViewChild('player', { read: ElementRef })
  set player(element: ElementRef) {
    this.playerRef = element?.nativeElement;
  }

  openai!: OpenAI;

  processing = false;

  recorderRef!: HTMLAudioElement;
  playerRef!: HTMLAudioElement;
  isRecording = false;
  chunks: any[] = [];
  mediaRecorder!: MediaRecorder;
  stream!: MediaStream | null;
  recordedAudio!: Blob | null;

  selectedProducts: ISelectedProduct[] = [];
  totalProducts = products;

  get allProductsList() {
    return this.totalProducts && this.totalProducts.map(p => p.name);
  }

  get isClearBtnDisabled(): boolean {
    return !this.recordedAudio || this.isRecording;
  }

  get isTranscribeBtnDisabled(): boolean {
    return !this.recordedAudio || this.isRecording;
  }

  get isCompletionBtnDisabled(): boolean {
    return !this.transcription;
  }

  constructor(private http: HttpClient) {
    import('src/assets/api-key').then(m => {
      this.openai = new OpenAI({
        apiKey: m.getApiKey().split('@$!;').join(''), // Using split to avoid API key leak on hosting app.
        dangerouslyAllowBrowser: true
      });
    })

  }

  ngOnInit(): void {
  }

  startRecording() {
    if (this.isRecording) {
      return;
    }
    this.isRecording = true;

    if (this.playerRef) {
      this.playerRef.src = '';
    }

    navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then((mediaStreamObj: MediaStream) => {
      this.handleSuccess(mediaStreamObj);
    }).catch((err) => {
      console.error(err.name, err.message);
    });
  }

  stopRecording() {
    if (!this.isRecording) {
      return;
    }
    this.isRecording = false;

    if (this.recorderRef) {
      this.recorderRef.pause();
    }

    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
    }

    setTimeout(() => {
      if (this.recordedAudio) {
        this.file = new File([this.recordedAudio], 'audio.mp3', {
          type: this.recordedAudio.type,
        });
      }
    }, 0);
  }

  clearRecording() {
    this.chunks = [];
    this.recordedAudio = null;
    if (this.playerRef) {
      this.playerRef.src = '';
    }

    this.stream?.getAudioTracks().forEach(track => track.stop());
    this.stream = null;
  }

  private handleSuccess(stream: MediaStream) {
    this.stream = stream;
    this.stream.addEventListener('oninactive', () => {
      console.log("Stream ended!")
    });

    if (this.recorderRef) {
      this.recorderRef.srcObject = stream;
    }

    this.mediaRecorder = new MediaRecorder(stream);

    this.mediaRecorder.ondataavailable = (ev) => {
      this.chunks.push(ev.data);
    }

    // Convert the audio data in to blob
    // after stopping the recording
    this.mediaRecorder.onstop = (ev) => this.onMediaRecorderStop(ev);

    this.mediaRecorder.start();
  }

  private onMediaRecorderStop(ev: any) {

    // blob of type mp3
    this.recordedAudio = new Blob(this.chunks, { 'type': 'audio/mp3;' });

    this.chunks = [];

    // Creating audio url with reference
    // of created blob named 'audioData'
    let audioSrc = window.URL.createObjectURL(this.recordedAudio);

    // Pass the audio url to the 2nd video tag
    if (this.playerRef) {
      this.playerRef.src = audioSrc;
    }

    this.stream?.getAudioTracks().forEach(track => track.stop());
    this.stream = null;
  }

  transcribeAudio() {
    this.processing = true;
    this.lastTranscription = this.transcription || this.lastTranscription;
    this.transcription = '';
    this.openai.audio.transcriptions.create({
      file: this.file,
      model: "whisper-1",
    }).then(value => {
      this.transcription = value.text;
      this.processing = false;
      this.clearRecording();
    }, err => {
      this.processing = false;
      console.error(err);
    });
  }

  // When using file upload control in html.
  handleFileUpload(ev: any) {
    this.lastTranscription = this.transcription;
    this.transcription = '';
    this.file = ev.dataTransfer ? ev.dataTransfer.files[0] : ev.target.files[0];
  }

  functions = [
    {
      "name": "addProduct",
      "description": "Add given product to the cart from the list of available products.",
      "parameters": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "The name of the product to add to the cart. Choose from the given list of products.",
            "enum": this.totalProducts.map(p => p.name)
          },
          "quantity": {
            "type": "number",
            "description": "The quantity of the product to add."
          }
        },
        "required": ["name", "quantity"]
      }
    },
    {
      "name": "removeProduct",
      "description": "Remove a product in the cart.",
      "parameters": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "The name of the product to remove from the cart.",
            "enum": this.totalProducts.map(p => p.name)
          },
        },
        "required": ["name"]
      }
    },
    {
      "name": "updateQuantity",
      "description": "Update the quantity of the product which is already added in the cart.",
      "parameters": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "The name of the product to update from the cart.",
            "enum": this.totalProducts.map(p => p.name)
          },
          "quantity": {
            "type": "number",
            "description": "The quantity of the product to update."
          }
        },
        "required": ["name", "quantity"]
      }
    },
    {
      "name": "clearCart",
      "description": "Clear and remove all the items in the cart.",
      "parameters": {
        "type": "object",
        "properties": {}
      }
    }
  ]

  completionProcess() {
    const messages = [{ role: "user", content: `Call a required function from this prompt:: ${this.transcription}` }] as any;
    this.lastTranscription = this.transcription || this.lastTranscription;
    this.transcription = '';
    this.processing = true;
    this.openai.chat.completions.create({
      messages: messages,
      model: "gpt-3.5-turbo-0613",
      functions: this.functions,
      function_call: "auto"
    }).then((response: any) => {
      this.processing = false;
      const responseMessage = response["choices"][0]["message"];
      if (responseMessage.function_call) {
        let funcArgs = {} as any;
        try {
          funcArgs = JSON.parse(responseMessage.function_call.arguments);
        }
        catch {
        }

        switch (responseMessage.function_call.name) {
          case "addProduct":
            this.addProduct(funcArgs.name, funcArgs.quantity, funcArgs.unit);
            break;
          case "removeProduct":
            this.removeProduct(funcArgs.name);
            break;
          case "updateQuantity":
            this.updateQuantity(funcArgs.name, funcArgs.quantity);
            break;
          case "clearCart":
            this.clearCart();
            break;
          default:
            alert(`There is no function to call with name: ${responseMessage.function_call.name}`);
            break;
        }
      } else {
        alert('Can you please provide more information or clarify your request?');
        console.error(responseMessage.content);
      }

    }, err => {
      this.processing = false;
      alert(`There was an error on completions API.`);
    });
  }

  addProduct(name: string, quantity: number, unit?: string) {
    const selectedProduct = this.totalProducts.find(p => p.name.toLowerCase() == name.trim().toLowerCase());
    if (selectedProduct) {
      if (this.selectedProducts.find(p => p.name.toLowerCase() == selectedProduct.name.trim().toLowerCase())) {
        this.updateQuantity(name, quantity);
      } else {
        this.selectedProducts.push({
          id: selectedProduct.id,
          name: selectedProduct.name,
          quantity: quantity,
          unit: unit
        });
      }
    } else {
      alert(`We do not have ${name}`);
    }
  }

  removeProduct(name: string) {
    if (this.selectedProducts.some((s: ISelectedProduct) => s.name.toLowerCase() == name.trim().toLowerCase())) {
      this.selectedProducts = this.selectedProducts.filter((s: ISelectedProduct) => s.name.toLowerCase() != name.trim().toLowerCase());
    } else {
      alert(`${name} is not present in the cart.`);
    }
  }

  updateQuantity(name: string, quantity: number) {
    const product = this.selectedProducts.find(p => p.name.toLowerCase() == name.trim().toLowerCase());
    if (product) {
      product.quantity = quantity;
    } else {
      alert(`${name} is not present in the cart.`);
    }
  }

  clearCart() {
    this.selectedProducts = [];
  }
}
