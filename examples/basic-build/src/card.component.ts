function Component(_opts: unknown): ClassDecorator {
  return () => {};
}
function Service(): ClassDecorator {
  return () => {};
}
function Inject(_token: unknown): ParameterDecorator {
  return () => {};
}
function Input(): PropertyDecorator {
  return () => {};
}
function Output(): PropertyDecorator {
  return () => {};
}
function HostBinding(_prop: string): PropertyDecorator {
  return () => {};
}
function HostListener(_event: string): MethodDecorator {
  return () => {};
}

@Service()
class Config {
  label = "hola desde Config";
}

@Component({
  selector: "app-card",
  templateUrl: "./card.component.html",
  styleUrl: "./card.component.css",
})
export class CardComponent {
  @Input() title!: string;
  @Output() closed = () => {};

  @HostBinding("class.open") isOpen = false;

  constructor(@Inject(Config) public config: Config) {}

  @HostListener("click")
  onClick(): void {}
}
